const functions = require("firebase-functions");
const admin = require("firebase-admin");
const fetch = require("node-fetch");
const {Octokit} = require("@octokit/rest");

// --- SSR DEPENDENCIES ---
const express = require('express');
const fs = require('fs');
const path = require('path');
// ------------------------

// Initialize the Firebase Admin SDK to access Firestore.
admin.initializeApp();
const db = admin.firestore();

// Retrieve the API key from function configuration for security.
const COMIC_VINE_API_KEY = functions.config().comicvine.key;
const COMIC_VINE_BASE_URL = "https://comicvine.gamespot.com";

// GitHub API Integration
const GITHUB_CONFIG = {
  owner: functions.config().github.owner,
  repo: functions.config().github.repo,
  token: functions.config().github.token,
};
const octokit = new Octokit({auth: GITHUB_CONFIG.token});

const APP_ID = "dc-dark-legion-builder";

const USER_PATH = `/artifacts/${APP_ID}/users`
const USER_COLLECTION_PATH_FOR_MEMENTOS = `${USER_PATH}/{userId}`; 
const MEMENTO_COLLECTION_PATH = `${USER_COLLECTION_PATH_FOR_MEMENTOS}/mementos/collection`; 
const TRADE_LISTINGS_PATH = `/artifacts/${APP_ID}/public/data/tradeListings`; 

/**
 * Firestore Trigger: Triggers when a user's memento collection changes.
 * This function updates the public tradeListings collection.
 */
exports.updateTradeListings = functions.firestore
  .document(MEMENTO_COLLECTION_PATH) 
  .onWrite(async (change, context) => {
    const { userId } = context.params; 
    const beforeData = change.before.data()?.mementos || {};
    const afterData = change.after.data()?.mementos || {};

    const allChangedIds = new Set([
      ...Object.keys(beforeData),
      ...Object.keys(afterData),
    ]);

    if (allChangedIds.size === 0) {
      functions.logger.log(`No mementos changed for user ${userId}.`);
      return null;
    }

    let userData = {};
    let userExists = false;
    let rawIgn = "N/A"; 
    let sanitizedIgn = "N/A"; 
    
    try {
      const userDoc = await db.collection(USER_PATH).doc(userId).get();
      if (userDoc.exists) {
        userExists = true;
        const profile = userDoc.data().gameProfile || {};
        rawIgn = profile.inGameName || userDoc.data().username || "N/A";
        sanitizedIgn = rawIgn.replace(/`/g, "'"); 
        functions.logger.log(`User ${userId}: Raw IGN='${rawIgn}', Sanitized IGN='${sanitizedIgn}'`);
        userData = {
          ign: rawIgn.replace(/`/g, "'"),
          discordId: userDoc.data().discordId || null,
          earthId: profile.earthId || null,
          allowMessages: profile.allowDiscordMessages || false, 
          userId: userId,
        };
      } else {
        functions.logger.warn(`User profile ${userId} not found in 'users' collection.`);
      }
    } catch (error) {
      functions.logger.error(`Failed to fetch user ${userId}:`, error);
      return null;
    }

    const batch = db.batch();
    const listingsRef = db.collection(TRADE_LISTINGS_PATH); 

    const existingListingsQuery = listingsRef.where("userId", "==", userId);
    const querySnapshot = await existingListingsQuery.get();
    const existingListingsMap = new Map();
    querySnapshot.forEach((doc) => {
      existingListingsMap.set(doc.data().mementoId, doc.id);
    });

    for (const mementoId of allChangedIds) {
      const oldCount = beforeData[mementoId] || 0;
      const newCount = afterData[mementoId] || 0;
      const existingDocId = existingListingsMap.get(mementoId);

      if (newCount > 1 && userExists) {
        const newDuplicates = newCount - 1;
        const listingData = {
          ...userData,
          mementoId: mementoId,
          duplicates: newDuplicates,
        };

        if (existingDocId) {
          const docRef = listingsRef.doc(existingDocId);
          batch.update(docRef, listingData);
        } else {
          const docRef = listingsRef.doc();
          batch.set(docRef, listingData);
        }
      } else if (oldCount > 1 && newCount <= 1) {
        if (existingDocId) {
          const docRef = listingsRef.doc(existingDocId);
          batch.delete(docRef);
        }
      }
    }

    try {
      await batch.commit();
      functions.logger.log(`Trade listings updated successfully for user ${userId}`);
      return null;
    } catch (error) {
      functions.logger.error(`Batch commit failed for user ${userId}:`, error);
      return null;
    }
  });


// #region ComicVine Utilities

/**
 * Fetches comic data from the external Comic Vine API.
 */
async function fetchComicFromApi(characterName) {
  if (!COMIC_VINE_API_KEY) {
    console.error("Comic Vine API key is not configured.");
    return null;
  }

  let offset = 0;
  const limit = 25; 
  let foundCharacterResult = null;
  let hasMoreResults = true;

  while (!foundCharacterResult && hasMoreResults) {
    try {
      const queryParams = [
        `api_key=${COMIC_VINE_API_KEY}`,
        "resources=character",
        `limit=${limit}`,
        `offset=${offset}`,
        "format=json",
      ].join("&");
      const prefix = `${COMIC_VINE_BASE_URL}/api/search/?query=`;
      const encoded = encodeURIComponent(characterName);
      const searchUrl = `${prefix}${encoded}&${queryParams}`;
      const searchResponse = await fetch(searchUrl);
      const searchData = await searchResponse.json();

      if (searchData.error !== "OK" ||
        !searchData.results ||
        searchData.results.length === 0
      ) {
        hasMoreResults = false;
        continue;
      }

      for (const result of searchData.results) {
        if (result.publisher && result.publisher.id === 10) {
          foundCharacterResult = result;
          break;
        }
      }

      if (!foundCharacterResult) {
        offset += searchData.number_of_page_results;
        if (offset >= searchData.number_of_total_results) {
          hasMoreResults = false;
        }
      }
    } catch (error) {
      console.error(`API SEARCH: Error searching ${characterName}:`, error);
      hasMoreResults = false;
    }
  }

  if (!foundCharacterResult) {
    console.warn(`API SEARCH: Character "${characterName}" not found.`);
    return null;
  }

  try {
    const foundCharacter = foundCharacterResult.api_detail_url;
    const queryParam = [
      `api_key=${COMIC_VINE_API_KEY}`,
      "format=json",
    ].join("&");
    const charDetailUrl = `${foundCharacter}?${queryParam}`;
    const charDetailResponse = await fetch(charDetailUrl);
    const charDetailData = await charDetailResponse.json();

    const firstAppearance = charDetailData.results?.first_appeared_in_issue;
    if (!firstAppearance) {
      console.warn(`API SEARCH: No 'issue' found for ${characterName}.`);
      return null;
    }
    const baseIssue = firstAppearance
        .api_detail_url
        .replace("first_appeared_in_issue", "issue");

    const filters = "field_list=" + [
      "image",
      "name",
      "issue_number",
      "cover_date",
      "site_detail_url",
    ].join(",");
    const issueUrl = `${baseIssue}?api_key=${COMIC_VINE_API_KEY}&${filters}`;

    const finalIssueResponse = await fetch(`${issueUrl}&format=json`);
    const finalIssueData = await finalIssueResponse.json();

    if (!finalIssueData.results) return null;

    const comic = finalIssueData.results;
    return {
      character: characterName,
      title: comic.name || `${characterName} Comic`,
      issueNumber: comic.issue_number,
      coverDate: comic.cover_date,
      imageUrl: comic.image?.super_url,
      siteUrl: comic.site_detail_url,
    };
  } catch (error) {
    console.error(`API SEARCH: Error fetching ${characterName}:`, error);
    return null;
  }
}

exports.comicVineProxy = functions.https.onRequest(async (req, res) => {
  const allowedOrigins = [
    "https://ogwmj.github.io",
    "http://dcdl.test",
    "https://dcdl-companion.com",
  ];

  const origin = req.headers.origin;
  if (allowedOrigins.includes(origin)) {
    res.set("Access-Control-Allow-Origin", origin);
  }

  if (req.method === "OPTIONS") {
    res.set("Access-Control-Allow-Methods", "GET");
    res.set("Access-Control-Allow-Headers", "Content-Type");
    res.status(204).send("");
    return;
  }

  const characterName = req.query.character;
  if (!characterName) {
    res.status(400).send("Bad Request: Missing 'character' query parameter.");
    return;
  }

  const characterId = characterName.replace(/\s+/g, "_").toLowerCase();
  const comicCollection = "dc-dark-legion-builder/public/data/characterComics";
  const docRef = db.collection("artifacts/" + comicCollection).doc(characterId);

  try {
    const docSnap = await docRef.get();
    if (docSnap.exists) {
      res.status(200).json(docSnap.data());
      return;
    }

    const comicData = await fetchComicFromApi(characterName);

    if (comicData) {
      const dataToSave = {
        ...comicData,
        cachedAt: admin.firestore.FieldValue.serverTimestamp(),
      };
      await docRef.set(dataToSave);
      res.status(200).json(comicData);
    } else {
      res.status(404).json({error: "Comic not found for this character."});
    }
  } catch (error) {
    console.error(`FATAL ERROR for ${characterName}:`, error);
    res.status(500).send("Internal Server Error");
  }
});

// #region --- Server Side Rendering (SSR) ---

const ssrApp = express();

/**
 * SSR Route for Champion Dossiers.
 * This function intercepts requests to /champion/:id, injects SEO meta tags,
 * and preloads data so the page is search-engine friendly.
 * * IMPORTANT: Ensure you have copied 'public/codex.html' to 'functions/public/codex.html'
 */
ssrApp.get('/champion/:championId', async (req, res) => {
  const { championId } = req.params;
  const view = req.query.view; // Support ?view=comic

  try {
      // 1. Fetch Data
      const champRef = db.doc(`artifacts/dc-dark-legion-builder/public/data/champions/${championId}`);
      const comicId = championId.replace(/-/g, '_'); 
      const comicRef = db.doc(`artifacts/dc-dark-legion-builder/public/data/characterComics/${comicId}`);

      const [champSnap, comicSnap] = await Promise.all([champRef.get(), comicRef.get()]);

      // 2. Read the HTML template
      // UPDATED: Looks for codex.html in the same directory as index.js
      const templatePath = path.resolve(__dirname, 'codex.html'); // eslint-disable-line no-undef
      
      if (!fs.existsSync(templatePath)) {
        functions.logger.error("SSR Error: codex.html not found in functions directory.");
        return res.status(500).send("Server Error: Template missing. Did you copy codex.html to functions/?");
      }

      let html = fs.readFileSync(templatePath, 'utf8');

      // 3. FIX RELATIVE PATHS
      // We inject <base href="/"> immediately after <head> so css/theme.css resolves to root
      if (!html.includes('<base href="/">')) {
        html = html.replace('<head>', '<head><base href="/">');
      }

      if (!champSnap.exists) {
        // Still return the page (with base tag fix) so client-side JS handles the 404 UI
        return res.status(404).send(html); 
      }

      const champion = champSnap.data();
      const comic = comicSnap.exists ? comicSnap.data() : null;

      // 4. Prepare Meta Data
      let title = `${champion.name} | DC: Dark Legion Codex`;
      let desc = `${champion.name} (${champion.class}) guide, skills, and synergies.`;
      let ogImage = champion.cardImageUrl || `https://dcdl-companion.com/img/champions/full/${championId}.webp`;

      if (view === 'comic' && comic) {
          title = `${champion.name}'s First Appearance: ${comic.title}`;
          desc = `Explore the comic book origins of ${champion.name} in ${comic.title} #${comic.issueNumber}.`;
          ogImage = comic.imageUrl || ogImage;
      }

      // 5. Inject Meta Tags & Data
      const metaHtml = `
          <title>${title}</title>
          <meta name="description" content="${desc}">
          <meta property="og:type" content="website">
          <meta property="og:title" content="${title}">
          <meta property="og:description" content="${desc}">
          <meta property="og:image" content="${ogImage}">
          <meta name="twitter:card" content="summary_large_image">
          <meta name="twitter:title" content="${title}">
          <meta name="twitter:description" content="${desc}">
          <meta name="twitter:image" content="${ogImage}">
          <script>window.PRELOADED_CHAMPION = ${JSON.stringify(champion)};</script>
      `;

      html = html.replace('<title>DC: Dark Legion - Champion Codex</title>', metaHtml);

      // 6. Set Cache Control (1 Hour)
      res.set('Cache-Control', 'public, max-age=3600, s-maxage=3600');
      res.send(html);

  } catch (error) {
      functions.logger.error("SSR Logic Error:", error);
      res.status(500).send("Internal Server Error");
  }
});

// Export the SSR app
exports.ssrApp = functions.https.onRequest(ssrApp);

// #region Champion Card Utilities

async function commitFileToGitHub(path, content, message) {
  if (!GITHUB_CONFIG.owner || !GITHUB_CONFIG.repo || !GITHUB_CONFIG.token) {
    throw new functions.https.HttpsError("failed-precondition",
        "GitHub configuration is missing.");
  }

  try {
    let existingFileSha = undefined;
    try {
      const {data: existingFile} = await octokit.repos.getContent({
        owner: GITHUB_CONFIG.owner,
        repo: GITHUB_CONFIG.repo,
        path: path,
      });
      existingFileSha = existingFile.sha;
    } catch (error) {
      if (error.status !== 404) throw error;
    }

    await octokit.repos.createOrUpdateFileContents({
      owner: GITHUB_CONFIG.owner,
      repo: GITHUB_CONFIG.repo,
      path: path,
      message: message,
      content: content,
      sha: existingFileSha,
    });

    functions.logger.info(`Successfully committed ${path} to GitHub.`);
    let url = `https://dcdl-companion.com/`;
    url = `${url}${path}`;

    return url;
  } catch (error) {
    functions.logger.error(`GitHub API Error for path ${path}:`, error);
    throw new functions.https.HttpsError("internal",
        "Failed to commit file to GitHub.");
  }
}

exports.saveChampionCardImage =
  functions.https.onCall(async (data, context) => {
    if (!context.auth) {
      functions.logger.warn("Function called by unauthenticated user. Denied.");
      throw new functions.https.HttpsError(
          "unauthenticated",
          "You must be logged in to create a new card image.",
      );
    }

    const {championId, championName, imageDataUrl} = data;
    if (!championId || !championName || !imageDataUrl) {
      throw new functions.https.HttpsError(
          "invalid-argument",
          "Required data (championId, championName, imageDataUrl) is missing.",
      );
    }

    functions.logger.info(`Processing champion: ${championName}`);

    try {
      const championFileNameBase = championName.replace(/\s+/g, "");
      const cardImageFileName = `${championFileNameBase}-card.png`;
      const filePath = `img/champions/cards/${cardImageFileName}`;
      const base64Content = imageDataUrl
          .replace(/^data:image\/\w+;base64,/, "");
      const commitMessage = `feat(champions): Add card for ${championName}`;

      const publicUrl = await commitFileToGitHub(
          filePath,
          base64Content,
          commitMessage,
      );

      await db
          .collection("artifacts/dc-dark-legion-builder/public/data/champions")
          .doc(championId)
          .update({
            cardImageUrl: publicUrl,
          });

      functions.logger.info(`Success: ${championId} card URL: ${publicUrl}`);

      return {
        success: true,
        url: publicUrl,
        imageDataUrl: data.imageDataUrl,
      };
    } catch (error) {
      functions.logger.error(`Error processing card for ${championId}:`, error);
      throw error;
    }
  },
  );

// #region --- Community Average Calculation ---

const STAR_LEVEL_TO_SCORE = {
  "Unlocked": 0, "White 1-Star": 1, "White 2-Star": 2, "White 3-Star": 3,
  "White 4-Star": 4, "White 5-Star": 5, "Blue 1-Star": 6, "Blue 2-Star": 7,
  "Blue 3-Star": 8, "Blue 4-Star": 9, "Blue 5-Star": 10, "Purple 1-Star": 11,
  "Purple 2-Star": 12, "Purple 3-Star": 13, "Purple 4-Star": 14,
  "Purple 5-Star": 15, "Gold 1-Star": 16, "Gold 2-Star": 17,
  "Gold 3-Star": 18, "Gold 4-Star": 19, "Gold 5-Star": 20, "Red 1-Star": 21,
  "Red 2-Star": 22, "Red 3-Star": 23, "Red 4-Star": 24, "Red 5-Star": 25,
};

const SCORE_TO_STAR_LEVEL = Object.fromEntries(
    Object.entries(STAR_LEVEL_TO_SCORE).map(([key, value]) => [value, key]),
);

exports.calculateCommunityAverages = functions.pubsub
    .schedule("every 24 hours")
    .onRun(async (context) => {
      functions.logger.log("Starting community average calculation job.");
      functions.logger.log(context);

      try {
        const rosterCollectionGroup = db.collectionGroup("roster");
        const rosterSnapshots = await rosterCollectionGroup.get();

        if (rosterSnapshots.empty) {
          functions.logger.log("No roster documents found. Exiting job.");
          return null;
        }

        const championStats = {};

        rosterSnapshots.forEach((rosterDoc) => {
          if (rosterDoc.id !== "myRoster" ||
          !rosterDoc.ref.path.startsWith(`artifacts/${APP_ID}/`)) {
            return;
          }

          if (!rosterDoc.exists) return;
          const champions = rosterDoc.data().champions || [];

          champions.forEach((champion) => {
            const {dbChampionId, starColorTier} = champion;
            const score = STAR_LEVEL_TO_SCORE[starColorTier];

            if (dbChampionId && typeof score !== "undefined" && score > 0) {
              if (!championStats[dbChampionId]) {
                championStats[dbChampionId] = {totalScore: 0, count: 0};
              }
              championStats[dbChampionId].totalScore += score;
              championStats[dbChampionId].count++;
            }
          });
        });

        const statCount = Object.keys(championStats).length;
        functions.logger.log(`Aggregated stats for ${statCount} champions.`);

        if (statCount === 0) {
          functions.logger.log("No valid champion data in rosters. Exiting.");
          return null;
        }

        const batch = db.batch();
        const championsCollection = `artifacts/${APP_ID}/public/data/champions`;

        for (const championId in championStats) {
          if (Object.prototype.hasOwnProperty.call(championStats, championId)) {
            const stats = championStats[championId];
            if (stats.count > 0) {
              const averageScore = Math.round(stats.totalScore / stats.count);
              const averageLevelString = SCORE_TO_STAR_LEVEL[averageScore] ||
              "N/A";
              const tempPath = `${championsCollection}/${championId}`;
              const championDocRef = db.doc(tempPath);

              batch.update(championDocRef, {
                communityAverageLevel: averageLevelString,
              });
            }
          }
        }

        await batch.commit();
        functions.logger.log("Successfully updated champions with averages.");
      } catch (error) {
        functions.logger.error("Error calculating community averages:", error);
      }

      return null;
    },
    );

const {ImageAnnotatorClient} = require("@google-cloud/vision");

exports.moderateCreatorLogo = functions.storage.object().onFinalize(
    async (object) => {
      const visionClient = new ImageAnnotatorClient();
      
      const filePath = object.name;
      const bucket = admin.storage().bucket(object.bucket);

      if (!filePath.startsWith("temp_uploads/")) {
        console.log("This is not a new upload. Ignoring.");
        return null;
      }

      const [safeSearchResult] = await visionClient.safeSearchDetection(
          `gs://${object.bucket}/${filePath}`,
      );
      const safeSearch = safeSearchResult.safeSearchAnnotation;

      const isUnsafe = safeSearch.adult === "VERY_LIKELY" ||
      safeSearch.adult === "LIKELY" ||
      safeSearch.violence === "VERY_LIKELY" ||
      safeSearch.violence === "LIKELY" ||
      safeSearch.racy === "VERY_LIKELY" ||
      safeSearch.racy === "LIKELY";

      if (isUnsafe) {
        console.warn(`Unsafe image detected, deleting: ${filePath}`);
        return bucket.file(filePath).delete();
      }

      console.log(`Image is safe, moving to permanent storage: ${filePath}`);
      const userId = filePath.split("/")[1]; 
      if (!userId) {
        console.error("Could not determine userId from file path.");
        return bucket.file(filePath).delete(); 
      }

      const newFilePath = `users/${userId}/logo.png`;
      const destinationFile = bucket.file(newFilePath);

      await bucket.file(filePath).move(destinationFile);
      await destinationFile.makePublic();

      const publicUrl = destinationFile.publicUrl();
      const userProfileRef = db.doc(
          `artifacts/dc-dark-legion-builder/users/${userId}`,
      );

      return userProfileRef.set({
        creatorProfile: {logo: publicUrl},
      }, {merge: true});
    },
);


// #region --- Discord Feedback Notification ---

exports.sendFeedbackNotificationToDiscord = functions.firestore
    .document("feedback/{feedbackId}")
    .onCreate(async (snap, context) => {
      const feedbackData = snap.data();
      const botToken = functions.config().discord.bot_token;
      const channelId = functions.config().discord.channel_id;

      if (!botToken || !channelId) {
        functions.logger.error(
            "Discord bot token or channel ID is not configured.",
        );
        return;
      }

      const discordApiUrl =
        `https://discord.com/api/v10/channels/${channelId}/messages`;

      const typeColorMap = {
        creator_submission: 3447003, 
        bug_report: 15158332, 
        suggestion: 15844367, 
        default: 9807270, 
      };

      const embed = {
        title: `New Feedback Submitted: ${feedbackData.type || "General"}`,
        description: feedbackData.message || "No message provided.",
        color: typeColorMap[feedbackData.type] || typeColorMap.default,
        fields: [
          {
            name: "Submitted By",
            value: feedbackData.discordName || "Anonymous",
            inline: true,
          },
          {
            name: "User ID",
            value: `\`${feedbackData.userId || "N/A"}\``,
            inline: true,
          },
          {
            name: "Context URL",
            value: feedbackData.url ? `[View](${feedbackData.url})` : "N/A",
          },
        ],
        footer: {
          text: `Feedback ID: ${context.params.feedbackId}`,
        },
        timestamp: feedbackData.createdAt ?
          feedbackData.createdAt.toDate().toISOString() :
          new Date().toISOString(),
      };

      const payload = {
        embeds: [embed],
      };

      try {
        const response = await fetch(discordApiUrl, {
          method: "POST",
          body: JSON.stringify(payload),
          headers: {
            "Content-Type": "application/json",
            "Authorization": `Bot ${botToken}`,
          },
        });

        if (response.ok) {
          functions.logger.info(
              `Successfully sent notification ID: ${context.params.feedbackId}`,
          );
        } else {
          const errorBody = await response.text();
          functions.logger.error(
              `Discord API returned an error for ${context.params.feedbackId}.`,
              {
                status: response.status,
                statusText: response.statusText,
                errorBody: errorBody,
              },
          );
        }
      } catch (error) {
        functions.logger.error(
            `Failed to send Discord feedback ${context.params.feedbackId}`,
            error,
        );
      }
    });

exports.linkDiscordAccount = functions.https.onCall(async (data, context) => {
  if (!context.auth) {
    throw new functions.https.HttpsError(
        "unauthenticated",
        "You must be logged in to link your account.",
    );
  }

  const token = data.token;
  const webUserId = context.auth.uid;

  if (!token || typeof token !== "string") {
    throw new functions.https.HttpsError(
        "invalid-argument",
        "A valid token must be provided.",
    );
  }

  const tokenRef = db.collection("discordAuthLinks").doc(token);
  const userRef = db.collection(`artifacts/${APP_ID}/users`).doc(webUserId);

  try {
    const tokenDoc = await tokenRef.get();

    if (!tokenDoc.exists) {
      throw new functions
          .https
          .HttpsError("not-found", "The link is invalid.");
    }

    const tokenData = tokenDoc.data();
    const discordUserId = tokenData.discordUserId;

    const tenMinutesAgo = admin
        .firestore
        .Timestamp
        .fromMillis(Date.now() - 10 * 60 * 1000);
    if (tokenDoc.data().createdAt < tenMinutesAgo) {
      await tokenRef.delete(); 
      throw new functions
          .https
          .HttpsError("deadline-exceeded", "Expired link.");
    }

    await userRef.set({
      discordId: discordUserId,
    }, {merge: true});

    await tokenRef.delete();

    return {success: true, message: "Account linked successfully."};
  } catch (error) {
    console.error("Error linking account:", error);
    if (error instanceof functions.https.HttpsError) {
      throw error;
    } else {
      throw new functions.https.HttpsError(
          "internal",
          "An unexpected error occurred while linking your account.",
      );
    }
  }
});

exports.syncCreatorProfileToPublic = functions.firestore
    .document("artifacts/dc-dark-legion-builder/users/{userId}")
    .onWrite(async (change) => {
      const newUserData = change.after.exists ? change.after.data() : null;
      const oldUserData = change.before.exists ? change.before.data() : null;

      if (!newUserData) {
        if (oldUserData && oldUserData.username) {
          await db
              .collection("public_creator_profiles")
              .doc(oldUserData.username)
              .delete();
        }
        return null; 
      }

      const username = newUserData.username;
      const creatorProfile = newUserData.creatorProfile;
      const roles = newUserData.roles || [];

      const isCreator = roles.includes("creator") && username && creatorProfile;

      if (!isCreator) {
        if (oldUserData && oldUserData.username) {
          await db.collection("public_creator_profiles")
              .doc(oldUserData.username)
              .delete();
        }
        return null;
      }

      const publicProfileData = {
        username: username,
        description: creatorProfile.description || "",
        logo: creatorProfile.logo || "",
        socials: {
          discord: creatorProfile.socials?.discord || "",
          youtube: creatorProfile.socials?.youtube || "",
          twitch: creatorProfile.socials?.twitch || "",
          x: creatorProfile.socials?.x || "", 
          tiktok: creatorProfile.socials?.tiktok || "",
          instagram: creatorProfile.socials?.instagram || "",
        },
      };

      const publicProfileDocRef = db
          .collection("public_creator_profiles")
          .doc(username);

      try {
        await publicProfileDocRef.set(publicProfileData, {merge: true});
        console.log(`Successfully synced public profile for ${username}`);
      } catch (error) {
        console.error(`Error syncing public profile for ${username}:`, error);
      }

      return null;
    });

exports.addCommunityMember = functions.https.onCall(async (data, context) => {
  if (!context.auth) {
    throw new functions.https.HttpsError(
        "unauthenticated",
        "You must be logged in to perform this action.",
    );
  }

  const {email, communityId} = data;
  if (!email || !communityId) {
    throw new functions.https.HttpsError(
        "invalid-argument",
        "Required data (email, communityId) is missing.",
    );
  }

  const callerUid = context.auth.uid;

  try {
    const communityRef = db.doc(`communities/${communityId}`);
    const userRef = db
        .doc(`artifacts/dc-dark-legion-builder/users/${callerUid}`);

    const [communityDoc, userDoc] = await Promise.all([
      communityRef.get(),
      userRef.get(),
    ]);

    if (!communityDoc.exists) {
      throw new functions.https
          .HttpsError("not-found", "Community not found.");
    }

    const communityData = communityDoc.data();
    const userData = userDoc.exists ? userDoc.data() : {};
    const userRoles = userData.roles || [];

    const isCommunityAdmin = callerUid === communityData.adminUid;
    const isSiteAdmin = userRoles.includes("admin");

    if (!isCommunityAdmin && !isSiteAdmin) {
      throw new functions.https.HttpsError(
          "permission-denied",
          "You do not have permission to add members to this community.",
      );
    }

    const userRecord = await admin.auth().getUserByEmail(email);
    const targetUid = userRecord.uid;

    const targetUserProfileRef = db
        .doc(`artifacts/dc-dark-legion-builder/users/${targetUid}`);
    const targetUserProfileSnap = await targetUserProfileRef.get();
    const targetUserProfile = targetUserProfileSnap.exists ?
      targetUserProfileSnap.data() : {};

    const memberRef = db
        .doc(`communities/${communityId}/members/${targetUid}`);

    await memberRef.set({
      displayName: targetUserProfile.username ||
              userRecord.displayName ||
              "New Member",
      photoURL: targetUserProfile.creatorProfile?.logo ||
              userRecord.photoURL ||
              null,
      joinedAt: admin.firestore.FieldValue.serverTimestamp(),
    });

    functions.logger
        .info(`User ${targetUid} added ${communityId} by ${callerUid}.`);

    return {
      success: true,
      message: `Successfully added ${email} to the community.`,
    };
  } catch (error) {
    functions.logger
        .error(`Error in addCommunityMember for ${communityId}:`, error);

    if (error.code === "auth/user-not-found") {
      throw new functions.https
          .HttpsError("not-found", "No user exists that email address.");
    }
    if (error instanceof functions.https.HttpsError) {
      throw error; 
    }
    throw new functions.https
        .HttpsError("internal", "An unexpected error occurred.");
  }
});