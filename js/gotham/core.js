import { getApp } from "https://www.gstatic.com/firebasejs/11.6.1/firebase-app.js";
import { getFirestore, doc, setDoc, getDoc } from "https://www.gstatic.com/firebasejs/11.6.1/firebase-firestore.js";
import { getAuth, onAuthStateChanged } from "https://www.gstatic.com/firebasejs/11.6.1/firebase-auth.js";

document.addEventListener("DOMContentLoaded", () => {
    const canvas = document.getElementById('map-canvas');
    const ctx = canvas.getContext('2d');
    const legendContainer = document.getElementById('player-legend');
    
    // --- FIREBASE VARIABLES ---
    let auth, db;

    // --- ISOMETRIC GRID CONFIGURATION ---
    const GRID_SIZE = 256;
    const TILE_W = 16; 
    const TILE_H = 8;  

    // --- ASSET MANAGEMENT ---
    const imagePaths = {
        cityHall: 'img/gotham/cityhall.webp',
        plaza: 'img/gotham/plazas.webp',
        armory: 'img/gotham/armories.webp'
    };
    const loadedImages = {};

    // --- MAP CONFIGURATION ---
    const mapConfig = {
        buildings: {
            cityHall: { grid: 12, imgScale: 1.4, offsetX: 0, offsetY: -16, flip: false },
            plaza: { grid: 6, imgScale: 1.4, offsetX: 0, offsetY: -8, flip: false },
            armory: { grid: 4, imgScale: 1.4, offsetX: 0, offsetY: -6, flip: false }
        },
        outOfBoundsAreas: [{"x":118,"y":134,"width":2,"height":2},{"x":120,"y":134,"width":2,"height":2},{"x":122,"y":134,"width":2,"height":2},{"x":122,"y":136,"width":2,"height":2},{"x":124,"y":136,"width":2,"height":2},{"x":126,"y":136,"width":2,"height":2},{"x":126,"y":138,"width":2,"height":2},{"x":128,"y":138,"width":2,"height":2},{"x":128,"y":136,"width":2,"height":2},{"x":128,"y":134,"width":2,"height":2},{"x":128,"y":132,"width":2,"height":2},{"x":128,"y":130,"width":2,"height":2},{"x":126,"y":130,"width":2,"height":2},{"x":126,"y":128,"width":2,"height":2},{"x":126,"y":126,"width":2,"height":2},{"x":124,"y":126,"width":2,"height":2},{"x":124,"y":124,"width":2,"height":2},{"x":122,"y":124,"width":2,"height":2},{"x":122,"y":122,"width":2,"height":2},{"x":120,"y":122,"width":2,"height":2},{"x":120,"y":124,"width":2,"height":2},{"x":120,"y":126,"width":2,"height":2},{"x":120,"y":128,"width":2,"height":2},{"x":120,"y":130,"width":2,"height":2},{"x":120,"y":132,"width":2,"height":2},{"x":118,"y":128,"width":2,"height":2},{"x":118,"y":126,"width":2,"height":2},{"x":118,"y":124,"width":2,"height":2},{"x":118,"y":130,"width":2,"height":2},{"x":118,"y":132,"width":2,"height":2},{"x":118,"y":136,"width":2,"height":2},{"x":116,"y":132,"width":2,"height":2},{"x":114,"y":132,"width":2,"height":2},{"x":112,"y":132,"width":2,"height":2},{"x":110,"y":130,"width":2,"height":2},{"x":108,"y":130,"width":2,"height":2},{"x":108,"y":128,"width":2,"height":2},{"x":106,"y":128,"width":2,"height":2},{"x":106,"y":126,"width":2,"height":2},{"x":104,"y":124,"width":2,"height":2},{"x":102,"y":122,"width":2,"height":2},{"x":102,"y":120,"width":2,"height":2},{"x":104,"y":122,"width":2,"height":2},{"x":106,"y":124,"width":2,"height":2},{"x":108,"y":126,"width":2,"height":2},{"x":110,"y":126,"width":2,"height":2},{"x":112,"y":126,"width":2,"height":2},{"x":114,"y":126,"width":2,"height":2},{"x":116,"y":128,"width":2,"height":2},{"x":124,"y":130,"width":2,"height":2},{"x":126,"y":132,"width":2,"height":2},{"x":130,"y":134,"width":2,"height":2},{"x":132,"y":136,"width":2,"height":2},{"x":134,"y":136,"width":2,"height":2},{"x":136,"y":138,"width":2,"height":2},{"x":138,"y":138,"width":2,"height":2},{"x":140,"y":140,"width":2,"height":2},{"x":142,"y":140,"width":2,"height":2},{"x":144,"y":140,"width":2,"height":2},{"x":146,"y":142,"width":2,"height":2},{"x":148,"y":144,"width":2,"height":2},{"x":148,"y":146,"width":2,"height":2},{"x":150,"y":146,"width":2,"height":2},{"x":150,"y":148,"width":2,"height":2},{"x":150,"y":150,"width":2,"height":2},{"x":152,"y":150,"width":2,"height":2},{"x":152,"y":152,"width":2,"height":2},{"x":152,"y":154,"width":2,"height":2},{"x":154,"y":154,"width":2,"height":2},{"x":154,"y":156,"width":2,"height":2},{"x":154,"y":158,"width":2,"height":2},{"x":156,"y":158,"width":2,"height":2},{"x":158,"y":158,"width":2,"height":2},{"x":158,"y":160,"width":2,"height":2},{"x":154,"y":160,"width":2,"height":2},{"x":156,"y":160,"width":2,"height":2},{"x":158,"y":156,"width":2,"height":2},{"x":156,"y":156,"width":2,"height":2},{"x":158,"y":154,"width":2,"height":2},{"x":158,"y":152,"width":2,"height":2},{"x":156,"y":152,"width":2,"height":2},{"x":156,"y":154,"width":2,"height":2},{"x":160,"y":158,"width":2,"height":2},{"x":160,"y":160,"width":2,"height":2},{"x":160,"y":156,"width":2,"height":2},{"x":160,"y":154,"width":2,"height":2},{"x":160,"y":152,"width":2,"height":2},{"x":160,"y":150,"width":2,"height":2},{"x":160,"y":148,"width":2,"height":2},{"x":160,"y":146,"width":2,"height":2},{"x":160,"y":144,"width":2,"height":2},{"x":160,"y":142,"width":2,"height":2},{"x":160,"y":140,"width":2,"height":2},{"x":158,"y":140,"width":2,"height":2},{"x":158,"y":138,"width":2,"height":2},{"x":156,"y":138,"width":2,"height":2},{"x":154,"y":138,"width":2,"height":2},{"x":154,"y":136,"width":2,"height":2},{"x":152,"y":136,"width":2,"height":2},{"x":150,"y":136,"width":2,"height":2},{"x":150,"y":134,"width":2,"height":2},{"x":148,"y":134,"width":2,"height":2},{"x":146,"y":134,"width":2,"height":2},{"x":144,"y":132,"width":2,"height":2},{"x":142,"y":132,"width":2,"height":2},{"x":140,"y":130,"width":2,"height":2},{"x":138,"y":130,"width":2,"height":2},{"x":136,"y":130,"width":2,"height":2},{"x":134,"y":128,"width":2,"height":2},{"x":132,"y":128,"width":2,"height":2},{"x":130,"y":128,"width":2,"height":2},{"x":128,"y":128,"width":2,"height":2},{"x":130,"y":130,"width":2,"height":2},{"x":128,"y":126,"width":2,"height":2},{"x":122,"y":126,"width":2,"height":2},{"x":122,"y":128,"width":2,"height":2},{"x":124,"y":132,"width":2,"height":2},{"x":122,"y":130,"width":2,"height":2},{"x":124,"y":134,"width":2,"height":2},{"x":124,"y":128,"width":2,"height":2},{"x":126,"y":134,"width":2,"height":2},{"x":122,"y":132,"width":2,"height":2},{"x":124,"y":122,"width":2,"height":2},{"x":124,"y":120,"width":2,"height":2},{"x":126,"y":124,"width":2,"height":2},{"x":126,"y":122,"width":2,"height":2},{"x":126,"y":120,"width":2,"height":2},{"x":128,"y":120,"width":2,"height":2},{"x":128,"y":122,"width":2,"height":2},{"x":128,"y":124,"width":2,"height":2},{"x":130,"y":132,"width":2,"height":2},{"x":132,"y":134,"width":2,"height":2},{"x":132,"y":138,"width":2,"height":2},{"x":132,"y":140,"width":2,"height":2},{"x":130,"y":136,"width":2,"height":2},{"x":130,"y":138,"width":2,"height":2},{"x":130,"y":140,"width":2,"height":2},{"x":130,"y":126,"width":2,"height":2},{"x":130,"y":124,"width":2,"height":2},{"x":130,"y":122,"width":2,"height":2},{"x":130,"y":120,"width":2,"height":2},{"x":130,"y":118,"width":2,"height":2},{"x":132,"y":120,"width":2,"height":2},{"x":132,"y":122,"width":2,"height":2},{"x":132,"y":124,"width":2,"height":2},{"x":132,"y":126,"width":2,"height":2},{"x":132,"y":130,"width":2,"height":2},{"x":132,"y":132,"width":2,"height":2},{"x":132,"y":142,"width":2,"height":2},{"x":134,"y":142,"width":2,"height":2},{"x":134,"y":140,"width":2,"height":2},{"x":136,"y":136,"width":2,"height":2},{"x":134,"y":134,"width":2,"height":2},{"x":134,"y":132,"width":2,"height":2},{"x":134,"y":130,"width":2,"height":2},{"x":134,"y":126,"width":2,"height":2},{"x":134,"y":124,"width":2,"height":2},{"x":134,"y":122,"width":2,"height":2},{"x":134,"y":120,"width":2,"height":2},{"x":134,"y":138,"width":2,"height":2},{"x":134,"y":144,"width":2,"height":2},{"x":134,"y":146,"width":2,"height":2},{"x":136,"y":146,"width":2,"height":2},{"x":136,"y":144,"width":2,"height":2},{"x":136,"y":142,"width":2,"height":2},{"x":136,"y":140,"width":2,"height":2},{"x":136,"y":134,"width":2,"height":2},{"x":136,"y":132,"width":2,"height":2},{"x":136,"y":128,"width":2,"height":2},{"x":134,"y":118,"width":2,"height":2},{"x":136,"y":126,"width":2,"height":2},{"x":136,"y":124,"width":2,"height":2},{"x":136,"y":122,"width":2,"height":2},{"x":136,"y":120,"width":2,"height":2},{"x":138,"y":140,"width":2,"height":2},{"x":138,"y":142,"width":2,"height":2},{"x":138,"y":144,"width":2,"height":2},{"x":140,"y":146,"width":2,"height":2},{"x":140,"y":148,"width":2,"height":2},{"x":140,"y":150,"width":2,"height":2},{"x":138,"y":150,"width":2,"height":2},{"x":136,"y":150,"width":2,"height":2},{"x":136,"y":152,"width":2,"height":2},{"x":138,"y":154,"width":2,"height":2},{"x":140,"y":154,"width":2,"height":2},{"x":142,"y":154,"width":2,"height":2},{"x":144,"y":156,"width":2,"height":2},{"x":146,"y":156,"width":2,"height":2},{"x":148,"y":156,"width":2,"height":2},{"x":150,"y":156,"width":2,"height":2},{"x":152,"y":158,"width":2,"height":2},{"x":152,"y":160,"width":2,"height":2},{"x":150,"y":160,"width":2,"height":2},{"x":148,"y":158,"width":2,"height":2},{"x":146,"y":158,"width":2,"height":2},{"x":146,"y":160,"width":2,"height":2},{"x":148,"y":160,"width":2,"height":2},{"x":144,"y":160,"width":2,"height":2},{"x":142,"y":160,"width":2,"height":2},{"x":140,"y":160,"width":2,"height":2},{"x":138,"y":160,"width":2,"height":2},{"x":136,"y":160,"width":2,"height":2},{"x":136,"y":158,"width":2,"height":2},{"x":134,"y":158,"width":2,"height":2},{"x":132,"y":158,"width":2,"height":2},{"x":130,"y":158,"width":2,"height":2},{"x":128,"y":158,"width":2,"height":2},{"x":134,"y":160,"width":2,"height":2},{"x":132,"y":160,"width":2,"height":2},{"x":126,"y":158,"width":2,"height":2},{"x":126,"y":156,"width":2,"height":2},{"x":126,"y":154,"width":2,"height":2},{"x":126,"y":152,"width":2,"height":2},{"x":126,"y":150,"width":2,"height":2},{"x":126,"y":148,"width":2,"height":2},{"x":126,"y":146,"width":2,"height":2},{"x":124,"y":146,"width":2,"height":2},{"x":124,"y":144,"width":2,"height":2},{"x":126,"y":144,"width":2,"height":2},{"x":126,"y":142,"width":2,"height":2},{"x":126,"y":140,"width":2,"height":2},{"x":130,"y":142,"width":2,"height":2},{"x":130,"y":144,"width":2,"height":2},{"x":130,"y":146,"width":2,"height":2},{"x":130,"y":148,"width":2,"height":2},{"x":130,"y":150,"width":2,"height":2},{"x":128,"y":152,"width":2,"height":2},{"x":130,"y":152,"width":2,"height":2},{"x":128,"y":150,"width":2,"height":2},{"x":128,"y":148,"width":2,"height":2},{"x":128,"y":146,"width":2,"height":2},{"x":128,"y":140,"width":2,"height":2},{"x":128,"y":142,"width":2,"height":2},{"x":128,"y":144,"width":2,"height":2},{"x":128,"y":154,"width":2,"height":2},{"x":128,"y":156,"width":2,"height":2},{"x":130,"y":160,"width":2,"height":2},{"x":128,"y":160,"width":2,"height":2},{"x":126,"y":160,"width":2,"height":2},{"x":130,"y":156,"width":2,"height":2},{"x":130,"y":154,"width":2,"height":2},{"x":132,"y":152,"width":2,"height":2},{"x":132,"y":154,"width":2,"height":2},{"x":132,"y":156,"width":2,"height":2},{"x":134,"y":156,"width":2,"height":2},{"x":136,"y":156,"width":2,"height":2},{"x":138,"y":156,"width":2,"height":2},{"x":140,"y":156,"width":2,"height":2},{"x":136,"y":154,"width":2,"height":2},{"x":134,"y":154,"width":2,"height":2},{"x":138,"y":158,"width":2,"height":2},{"x":140,"y":158,"width":2,"height":2},{"x":142,"y":158,"width":2,"height":2},{"x":144,"y":158,"width":2,"height":2},{"x":150,"y":158,"width":2,"height":2},{"x":152,"y":156,"width":2,"height":2},{"x":154,"y":152,"width":2,"height":2},{"x":150,"y":154,"width":2,"height":2},{"x":142,"y":156,"width":2,"height":2},{"x":138,"y":152,"width":2,"height":2},{"x":136,"y":148,"width":2,"height":2},{"x":132,"y":144,"width":2,"height":2},{"x":132,"y":146,"width":2,"height":2},{"x":132,"y":148,"width":2,"height":2},{"x":134,"y":148,"width":2,"height":2},{"x":134,"y":150,"width":2,"height":2},{"x":132,"y":150,"width":2,"height":2},{"x":134,"y":152,"width":2,"height":2},{"x":138,"y":148,"width":2,"height":2},{"x":138,"y":146,"width":2,"height":2},{"x":140,"y":144,"width":2,"height":2},{"x":124,"y":138,"width":2,"height":2},{"x":120,"y":136,"width":2,"height":2},{"x":120,"y":138,"width":2,"height":2},{"x":122,"y":138,"width":2,"height":2},{"x":122,"y":140,"width":2,"height":2},{"x":124,"y":142,"width":2,"height":2},{"x":124,"y":140,"width":2,"height":2},{"x":114,"y":130,"width":2,"height":2},{"x":112,"y":128,"width":2,"height":2},{"x":110,"y":124,"width":2,"height":2},{"x":112,"y":130,"width":2,"height":2},{"x":116,"y":134,"width":2,"height":2},{"x":116,"y":136,"width":2,"height":2},{"x":118,"y":138,"width":2,"height":2},{"x":120,"y":140,"width":2,"height":2},{"x":110,"y":128,"width":2,"height":2},{"x":116,"y":126,"width":2,"height":2},{"x":114,"y":124,"width":2,"height":2},{"x":114,"y":122,"width":2,"height":2},{"x":114,"y":120,"width":2,"height":2},{"x":112,"y":120,"width":2,"height":2},{"x":116,"y":124,"width":2,"height":2},{"x":118,"y":122,"width":2,"height":2},{"x":120,"y":120,"width":2,"height":2},{"x":122,"y":118,"width":2,"height":2},{"x":120,"y":118,"width":2,"height":2},{"x":118,"y":120,"width":2,"height":2},{"x":116,"y":122,"width":2,"height":2},{"x":112,"y":124,"width":2,"height":2},{"x":120,"y":116,"width":2,"height":2},{"x":118,"y":116,"width":2,"height":2},{"x":116,"y":118,"width":2,"height":2},{"x":114,"y":118,"width":2,"height":2},{"x":110,"y":120,"width":2,"height":2},{"x":108,"y":122,"width":2,"height":2},{"x":108,"y":124,"width":2,"height":2},{"x":110,"y":122,"width":2,"height":2},{"x":112,"y":118,"width":2,"height":2},{"x":114,"y":116,"width":2,"height":2},{"x":116,"y":114,"width":2,"height":2},{"x":114,"y":114,"width":2,"height":2},{"x":112,"y":116,"width":2,"height":2},{"x":110,"y":118,"width":2,"height":2},{"x":124,"y":116,"width":2,"height":2},{"x":122,"y":116,"width":2,"height":2},{"x":112,"y":122,"width":2,"height":2},{"x":116,"y":116,"width":2,"height":2},{"x":116,"y":120,"width":2,"height":2},{"x":118,"y":118,"width":2,"height":2},{"x":120,"y":114,"width":2,"height":2},{"x":114,"y":136,"width":2,"height":2},{"x":112,"y":138,"width":2,"height":2},{"x":112,"y":140,"width":2,"height":2},{"x":114,"y":140,"width":2,"height":2},{"x":114,"y":138,"width":2,"height":2},{"x":116,"y":130,"width":2,"height":2},{"x":114,"y":128,"width":2,"height":2},{"x":122,"y":120,"width":2,"height":2},{"x":126,"y":118,"width":2,"height":2},{"x":128,"y":118,"width":2,"height":2},{"x":124,"y":118,"width":2,"height":2},{"x":128,"y":116,"width":2,"height":2},{"x":130,"y":114,"width":2,"height":2},{"x":130,"y":116,"width":2,"height":2},{"x":132,"y":116,"width":2,"height":2},{"x":138,"y":128,"width":2,"height":2},{"x":138,"y":132,"width":2,"height":2},{"x":138,"y":134,"width":2,"height":2},{"x":140,"y":136,"width":2,"height":2},{"x":140,"y":138,"width":2,"height":2},{"x":140,"y":134,"width":2,"height":2},{"x":140,"y":132,"width":2,"height":2},{"x":138,"y":136,"width":2,"height":2},{"x":142,"y":146,"width":2,"height":2},{"x":142,"y":150,"width":2,"height":2},{"x":144,"y":152,"width":2,"height":2},{"x":146,"y":154,"width":2,"height":2},{"x":144,"y":154,"width":2,"height":2},{"x":142,"y":152,"width":2,"height":2},{"x":140,"y":152,"width":2,"height":2},{"x":144,"y":150,"width":2,"height":2},{"x":144,"y":148,"width":2,"height":2},{"x":144,"y":146,"width":2,"height":2},{"x":142,"y":144,"width":2,"height":2},{"x":142,"y":142,"width":2,"height":2},{"x":142,"y":138,"width":2,"height":2},{"x":142,"y":136,"width":2,"height":2},{"x":142,"y":148,"width":2,"height":2},{"x":142,"y":134,"width":2,"height":2},{"x":140,"y":142,"width":2,"height":2},{"x":144,"y":134,"width":2,"height":2},{"x":144,"y":136,"width":2,"height":2},{"x":146,"y":136,"width":2,"height":2},{"x":146,"y":138,"width":2,"height":2},{"x":146,"y":140,"width":2,"height":2},{"x":144,"y":142,"width":2,"height":2},{"x":144,"y":144,"width":2,"height":2},{"x":146,"y":146,"width":2,"height":2},{"x":146,"y":148,"width":2,"height":2},{"x":146,"y":150,"width":2,"height":2},{"x":146,"y":152,"width":2,"height":2},{"x":148,"y":154,"width":2,"height":2},{"x":148,"y":152,"width":2,"height":2},{"x":148,"y":150,"width":2,"height":2},{"x":148,"y":148,"width":2,"height":2},{"x":148,"y":142,"width":2,"height":2},{"x":148,"y":140,"width":2,"height":2},{"x":148,"y":138,"width":2,"height":2},{"x":148,"y":136,"width":2,"height":2},{"x":144,"y":138,"width":2,"height":2},{"x":146,"y":144,"width":2,"height":2},{"x":150,"y":152,"width":2,"height":2},{"x":150,"y":144,"width":2,"height":2},{"x":150,"y":142,"width":2,"height":2},{"x":150,"y":140,"width":2,"height":2},{"x":150,"y":138,"width":2,"height":2},{"x":152,"y":138,"width":2,"height":2},{"x":152,"y":140,"width":2,"height":2},{"x":152,"y":142,"width":2,"height":2},{"x":152,"y":144,"width":2,"height":2},{"x":152,"y":146,"width":2,"height":2},{"x":152,"y":148,"width":2,"height":2},{"x":156,"y":150,"width":2,"height":2},{"x":156,"y":148,"width":2,"height":2},{"x":156,"y":146,"width":2,"height":2},{"x":154,"y":144,"width":2,"height":2},{"x":154,"y":142,"width":2,"height":2},{"x":154,"y":140,"width":2,"height":2},{"x":154,"y":150,"width":2,"height":2},{"x":154,"y":146,"width":2,"height":2},{"x":154,"y":148,"width":2,"height":2},{"x":156,"y":144,"width":2,"height":2},{"x":156,"y":142,"width":2,"height":2},{"x":156,"y":140,"width":2,"height":2},{"x":158,"y":142,"width":2,"height":2},{"x":158,"y":144,"width":2,"height":2},{"x":158,"y":146,"width":2,"height":2},{"x":158,"y":148,"width":2,"height":2},{"x":158,"y":150,"width":2,"height":2},{"x":160,"y":138,"width":2,"height":2},{"x":160,"y":136,"width":2,"height":2},{"x":160,"y":134,"width":2,"height":2},{"x":158,"y":134,"width":2,"height":2},{"x":158,"y":132,"width":2,"height":2},{"x":160,"y":132,"width":2,"height":2},{"x":160,"y":130,"width":2,"height":2},{"x":160,"y":128,"width":2,"height":2},{"x":160,"y":126,"width":2,"height":2},{"x":160,"y":124,"width":2,"height":2},{"x":158,"y":124,"width":2,"height":2},{"x":158,"y":122,"width":2,"height":2},{"x":158,"y":120,"width":2,"height":2},{"x":158,"y":118,"width":2,"height":2},{"x":158,"y":116,"width":2,"height":2},{"x":160,"y":120,"width":2,"height":2},{"x":160,"y":122,"width":2,"height":2},{"x":160,"y":118,"width":2,"height":2},{"x":158,"y":114,"width":2,"height":2},{"x":158,"y":112,"width":2,"height":2},{"x":158,"y":110,"width":2,"height":2},{"x":158,"y":108,"width":2,"height":2},{"x":160,"y":112,"width":2,"height":2},{"x":160,"y":114,"width":2,"height":2},{"x":160,"y":116,"width":2,"height":2},{"x":158,"y":106,"width":2,"height":2},{"x":158,"y":104,"width":2,"height":2},{"x":156,"y":108,"width":2,"height":2},{"x":156,"y":110,"width":2,"height":2},{"x":156,"y":112,"width":2,"height":2},{"x":156,"y":114,"width":2,"height":2},{"x":156,"y":116,"width":2,"height":2},{"x":156,"y":118,"width":2,"height":2},{"x":154,"y":118,"width":2,"height":2},{"x":154,"y":120,"width":2,"height":2},{"x":154,"y":122,"width":2,"height":2},{"x":154,"y":124,"width":2,"height":2},{"x":154,"y":126,"width":2,"height":2},{"x":154,"y":128,"width":2,"height":2},{"x":156,"y":130,"width":2,"height":2},{"x":156,"y":132,"width":2,"height":2},{"x":154,"y":132,"width":2,"height":2},{"x":154,"y":134,"width":2,"height":2},{"x":156,"y":134,"width":2,"height":2},{"x":156,"y":136,"width":2,"height":2},{"x":158,"y":130,"width":2,"height":2},{"x":158,"y":128,"width":2,"height":2},{"x":158,"y":126,"width":2,"height":2},{"x":158,"y":136,"width":2,"height":2},{"x":152,"y":132,"width":2,"height":2},{"x":152,"y":130,"width":2,"height":2},{"x":152,"y":126,"width":2,"height":2},{"x":152,"y":134,"width":2,"height":2},{"x":150,"y":132,"width":2,"height":2},{"x":148,"y":132,"width":2,"height":2},{"x":146,"y":132,"width":2,"height":2},{"x":142,"y":130,"width":2,"height":2},{"x":138,"y":126,"width":2,"height":2},{"x":140,"y":126,"width":2,"height":2},{"x":142,"y":128,"width":2,"height":2},{"x":144,"y":128,"width":2,"height":2},{"x":146,"y":130,"width":2,"height":2},{"x":148,"y":130,"width":2,"height":2},{"x":150,"y":130,"width":2,"height":2},{"x":154,"y":130,"width":2,"height":2},{"x":150,"y":128,"width":2,"height":2},{"x":148,"y":128,"width":2,"height":2},{"x":146,"y":128,"width":2,"height":2},{"x":140,"y":128,"width":2,"height":2},{"x":144,"y":130,"width":2,"height":2},{"x":148,"y":126,"width":2,"height":2},{"x":146,"y":126,"width":2,"height":2},{"x":144,"y":126,"width":2,"height":2},{"x":142,"y":126,"width":2,"height":2},{"x":140,"y":124,"width":2,"height":2},{"x":138,"y":124,"width":2,"height":2},{"x":138,"y":122,"width":2,"height":2},{"x":134,"y":116,"width":2,"height":2},{"x":134,"y":114,"width":2,"height":2},{"x":132,"y":118,"width":2,"height":2},{"x":132,"y":114,"width":2,"height":2},{"x":136,"y":114,"width":2,"height":2},{"x":138,"y":114,"width":2,"height":2},{"x":140,"y":112,"width":2,"height":2},{"x":144,"y":112,"width":2,"height":2},{"x":146,"y":110,"width":2,"height":2},{"x":148,"y":110,"width":2,"height":2},{"x":150,"y":110,"width":2,"height":2},{"x":150,"y":112,"width":2,"height":2},{"x":150,"y":114,"width":2,"height":2},{"x":150,"y":116,"width":2,"height":2},{"x":150,"y":118,"width":2,"height":2},{"x":150,"y":120,"width":2,"height":2},{"x":148,"y":122,"width":2,"height":2},{"x":148,"y":124,"width":2,"height":2},{"x":150,"y":124,"width":2,"height":2},{"x":152,"y":124,"width":2,"height":2},{"x":152,"y":122,"width":2,"height":2},{"x":152,"y":120,"width":2,"height":2},{"x":156,"y":126,"width":2,"height":2},{"x":156,"y":128,"width":2,"height":2},{"x":156,"y":124,"width":2,"height":2},{"x":156,"y":122,"width":2,"height":2},{"x":156,"y":120,"width":2,"height":2},{"x":152,"y":128,"width":2,"height":2},{"x":150,"y":126,"width":2,"height":2},{"x":150,"y":122,"width":2,"height":2},{"x":146,"y":122,"width":2,"height":2},{"x":144,"y":122,"width":2,"height":2},{"x":144,"y":124,"width":2,"height":2},{"x":142,"y":124,"width":2,"height":2},{"x":146,"y":124,"width":2,"height":2},{"x":142,"y":122,"width":2,"height":2},{"x":140,"y":122,"width":2,"height":2},{"x":136,"y":118,"width":2,"height":2},{"x":138,"y":118,"width":2,"height":2},{"x":138,"y":116,"width":2,"height":2},{"x":140,"y":116,"width":2,"height":2},{"x":142,"y":116,"width":2,"height":2},{"x":142,"y":114,"width":2,"height":2},{"x":144,"y":114,"width":2,"height":2},{"x":146,"y":116,"width":2,"height":2},{"x":148,"y":116,"width":2,"height":2},{"x":148,"y":118,"width":2,"height":2},{"x":146,"y":120,"width":2,"height":2},{"x":144,"y":120,"width":2,"height":2},{"x":140,"y":120,"width":2,"height":2},{"x":138,"y":120,"width":2,"height":2},{"x":140,"y":118,"width":2,"height":2},{"x":142,"y":118,"width":2,"height":2},{"x":144,"y":118,"width":2,"height":2},{"x":146,"y":118,"width":2,"height":2},{"x":142,"y":120,"width":2,"height":2},{"x":146,"y":114,"width":2,"height":2},{"x":148,"y":112,"width":2,"height":2},{"x":148,"y":114,"width":2,"height":2},{"x":148,"y":120,"width":2,"height":2},{"x":146,"y":108,"width":2,"height":2},{"x":146,"y":106,"width":2,"height":2},{"x":144,"y":106,"width":2,"height":2},{"x":144,"y":108,"width":2,"height":2},{"x":142,"y":110,"width":2,"height":2},{"x":140,"y":114,"width":2,"height":2},{"x":144,"y":110,"width":2,"height":2},{"x":138,"y":112,"width":2,"height":2},{"x":136,"y":112,"width":2,"height":2},{"x":136,"y":110,"width":2,"height":2},{"x":138,"y":108,"width":2,"height":2},{"x":138,"y":106,"width":2,"height":2},{"x":138,"y":104,"width":2,"height":2},{"x":136,"y":104,"width":2,"height":2},{"x":136,"y":102,"width":2,"height":2},{"x":134,"y":102,"width":2,"height":2},{"x":132,"y":104,"width":2,"height":2},{"x":130,"y":104,"width":2,"height":2},{"x":128,"y":106,"width":2,"height":2},{"x":124,"y":108,"width":2,"height":2},{"x":124,"y":110,"width":2,"height":2},{"x":122,"y":112,"width":2,"height":2},{"x":126,"y":108,"width":2,"height":2},{"x":126,"y":106,"width":2,"height":2},{"x":130,"y":106,"width":2,"height":2},{"x":132,"y":106,"width":2,"height":2},{"x":134,"y":106,"width":2,"height":2},{"x":136,"y":106,"width":2,"height":2},{"x":140,"y":106,"width":2,"height":2},{"x":142,"y":106,"width":2,"height":2},{"x":148,"y":108,"width":2,"height":2},{"x":152,"y":110,"width":2,"height":2},{"x":154,"y":110,"width":2,"height":2},{"x":152,"y":112,"width":2,"height":2},{"x":154,"y":114,"width":2,"height":2},{"x":160,"y":108,"width":2,"height":2},{"x":160,"y":106,"width":2,"height":2},{"x":160,"y":110,"width":2,"height":2},{"x":154,"y":112,"width":2,"height":2},{"x":152,"y":114,"width":2,"height":2},{"x":152,"y":116,"width":2,"height":2},{"x":152,"y":118,"width":2,"height":2},{"x":154,"y":116,"width":2,"height":2},{"x":144,"y":116,"width":2,"height":2},{"x":136,"y":116,"width":2,"height":2},{"x":126,"y":116,"width":2,"height":2},{"x":122,"y":114,"width":2,"height":2},{"x":118,"y":114,"width":2,"height":2},{"x":120,"y":112,"width":2,"height":2},{"x":120,"y":110,"width":2,"height":2},{"x":124,"y":112,"width":2,"height":2},{"x":126,"y":112,"width":2,"height":2},{"x":128,"y":112,"width":2,"height":2},{"x":130,"y":112,"width":2,"height":2},{"x":128,"y":114,"width":2,"height":2},{"x":126,"y":114,"width":2,"height":2},{"x":126,"y":110,"width":2,"height":2},{"x":128,"y":108,"width":2,"height":2},{"x":128,"y":110,"width":2,"height":2},{"x":130,"y":110,"width":2,"height":2},{"x":130,"y":108,"width":2,"height":2},{"x":132,"y":108,"width":2,"height":2},{"x":134,"y":110,"width":2,"height":2},{"x":134,"y":112,"width":2,"height":2},{"x":136,"y":108,"width":2,"height":2},{"x":134,"y":108,"width":2,"height":2},{"x":132,"y":110,"width":2,"height":2},{"x":138,"y":110,"width":2,"height":2},{"x":140,"y":108,"width":2,"height":2},{"x":140,"y":110,"width":2,"height":2},{"x":142,"y":112,"width":2,"height":2},{"x":142,"y":108,"width":2,"height":2},{"x":146,"y":112,"width":2,"height":2},{"x":132,"y":112,"width":2,"height":2},{"x":124,"y":114,"width":2,"height":2},{"x":190,"y":130,"width":2,"height":2},{"x":188,"y":130,"width":2,"height":2},{"x":186,"y":130,"width":2,"height":2},{"x":184,"y":130,"width":2,"height":2},{"x":184,"y":128,"width":2,"height":2},{"x":184,"y":126,"width":2,"height":2},{"x":186,"y":126,"width":2,"height":2},{"x":186,"y":124,"width":2,"height":2},{"x":184,"y":124,"width":2,"height":2},{"x":186,"y":128,"width":2,"height":2},{"x":188,"y":128,"width":2,"height":2},{"x":190,"y":128,"width":2,"height":2},{"x":190,"y":126,"width":2,"height":2},{"x":190,"y":124,"width":2,"height":2},{"x":188,"y":124,"width":2,"height":2},{"x":188,"y":126,"width":2,"height":2},{"x":160,"y":104,"width":2,"height":2},{"x":160,"y":102,"width":2,"height":2},{"x":160,"y":100,"width":2,"height":2},{"x":160,"y":98,"width":2,"height":2},{"x":160,"y":96,"width":2,"height":2},{"x":158,"y":96,"width":2,"height":2},{"x":158,"y":94,"width":2,"height":2},{"x":160,"y":94,"width":2,"height":2},{"x":156,"y":94,"width":2,"height":2},{"x":154,"y":94,"width":2,"height":2},{"x":154,"y":96,"width":2,"height":2},{"x":152,"y":98,"width":2,"height":2},{"x":152,"y":100,"width":2,"height":2},{"x":154,"y":100,"width":2,"height":2},{"x":154,"y":102,"width":2,"height":2},{"x":156,"y":100,"width":2,"height":2},{"x":158,"y":98,"width":2,"height":2},{"x":156,"y":98,"width":2,"height":2},{"x":156,"y":96,"width":2,"height":2},{"x":154,"y":98,"width":2,"height":2},{"x":158,"y":100,"width":2,"height":2},{"x":158,"y":102,"width":2,"height":2},{"x":156,"y":102,"width":2,"height":2},{"x":156,"y":104,"width":2,"height":2},{"x":156,"y":106,"width":2,"height":2},{"x":154,"y":108,"width":2,"height":2},{"x":154,"y":106,"width":2,"height":2},{"x":154,"y":104,"width":2,"height":2},{"x":152,"y":102,"width":2,"height":2},{"x":152,"y":104,"width":2,"height":2},{"x":152,"y":106,"width":2,"height":2},{"x":152,"y":108,"width":2,"height":2},{"x":150,"y":104,"width":2,"height":2},{"x":150,"y":106,"width":2,"height":2},{"x":150,"y":108,"width":2,"height":2},{"x":130,"y":70,"width":2,"height":2},{"x":128,"y":70,"width":2,"height":2},{"x":126,"y":70,"width":2,"height":2},{"x":126,"y":68,"width":2,"height":2},{"x":124,"y":70,"width":2,"height":2},{"x":124,"y":68,"width":2,"height":2},{"x":124,"y":66,"width":2,"height":2},{"x":124,"y":64,"width":2,"height":2},{"x":126,"y":64,"width":2,"height":2},{"x":128,"y":64,"width":2,"height":2},{"x":130,"y":64,"width":2,"height":2},{"x":130,"y":66,"width":2,"height":2},{"x":130,"y":68,"width":2,"height":2},{"x":128,"y":68,"width":2,"height":2},{"x":128,"y":66,"width":2,"height":2},{"x":126,"y":66,"width":2,"height":2},{"x":152,"y":94,"width":2,"height":2},{"x":150,"y":94,"width":2,"height":2},{"x":148,"y":94,"width":2,"height":2},{"x":146,"y":94,"width":2,"height":2},{"x":144,"y":94,"width":2,"height":2},{"x":142,"y":94,"width":2,"height":2},{"x":140,"y":94,"width":2,"height":2},{"x":138,"y":94,"width":2,"height":2},{"x":136,"y":94,"width":2,"height":2},{"x":134,"y":94,"width":2,"height":2},{"x":132,"y":94,"width":2,"height":2},{"x":130,"y":94,"width":2,"height":2},{"x":128,"y":94,"width":2,"height":2},{"x":126,"y":94,"width":2,"height":2},{"x":124,"y":94,"width":2,"height":2},{"x":122,"y":94,"width":2,"height":2},{"x":120,"y":94,"width":2,"height":2},{"x":118,"y":94,"width":2,"height":2},{"x":118,"y":96,"width":2,"height":2},{"x":120,"y":98,"width":2,"height":2},{"x":120,"y":100,"width":2,"height":2},{"x":120,"y":102,"width":2,"height":2},{"x":118,"y":98,"width":2,"height":2},{"x":118,"y":100,"width":2,"height":2},{"x":118,"y":102,"width":2,"height":2},{"x":122,"y":102,"width":2,"height":2},{"x":122,"y":104,"width":2,"height":2},{"x":122,"y":106,"width":2,"height":2},{"x":124,"y":106,"width":2,"height":2},{"x":124,"y":104,"width":2,"height":2},{"x":126,"y":104,"width":2,"height":2},{"x":128,"y":104,"width":2,"height":2},{"x":134,"y":104,"width":2,"height":2},{"x":140,"y":104,"width":2,"height":2},{"x":148,"y":106,"width":2,"height":2},{"x":150,"y":102,"width":2,"height":2},{"x":152,"y":96,"width":2,"height":2},{"x":150,"y":96,"width":2,"height":2},{"x":148,"y":96,"width":2,"height":2},{"x":146,"y":96,"width":2,"height":2},{"x":144,"y":96,"width":2,"height":2},{"x":142,"y":96,"width":2,"height":2},{"x":140,"y":96,"width":2,"height":2},{"x":138,"y":96,"width":2,"height":2},{"x":136,"y":96,"width":2,"height":2},{"x":134,"y":96,"width":2,"height":2},{"x":132,"y":96,"width":2,"height":2},{"x":130,"y":96,"width":2,"height":2},{"x":128,"y":96,"width":2,"height":2},{"x":126,"y":96,"width":2,"height":2},{"x":124,"y":96,"width":2,"height":2},{"x":122,"y":96,"width":2,"height":2},{"x":120,"y":96,"width":2,"height":2},{"x":122,"y":98,"width":2,"height":2},{"x":122,"y":100,"width":2,"height":2},{"x":124,"y":98,"width":2,"height":2},{"x":126,"y":98,"width":2,"height":2},{"x":128,"y":98,"width":2,"height":2},{"x":130,"y":98,"width":2,"height":2},{"x":132,"y":98,"width":2,"height":2},{"x":134,"y":98,"width":2,"height":2},{"x":136,"y":98,"width":2,"height":2},{"x":138,"y":98,"width":2,"height":2},{"x":140,"y":98,"width":2,"height":2},{"x":142,"y":98,"width":2,"height":2},{"x":144,"y":98,"width":2,"height":2},{"x":146,"y":98,"width":2,"height":2},{"x":148,"y":98,"width":2,"height":2},{"x":150,"y":98,"width":2,"height":2},{"x":150,"y":100,"width":2,"height":2},{"x":148,"y":100,"width":2,"height":2},{"x":146,"y":100,"width":2,"height":2},{"x":144,"y":100,"width":2,"height":2},{"x":142,"y":100,"width":2,"height":2},{"x":140,"y":100,"width":2,"height":2},{"x":138,"y":100,"width":2,"height":2},{"x":136,"y":100,"width":2,"height":2},{"x":134,"y":100,"width":2,"height":2},{"x":132,"y":100,"width":2,"height":2},{"x":130,"y":100,"width":2,"height":2},{"x":128,"y":100,"width":2,"height":2},{"x":126,"y":100,"width":2,"height":2},{"x":124,"y":100,"width":2,"height":2},{"x":124,"y":102,"width":2,"height":2},{"x":126,"y":102,"width":2,"height":2},{"x":128,"y":102,"width":2,"height":2},{"x":130,"y":102,"width":2,"height":2},{"x":132,"y":102,"width":2,"height":2},{"x":138,"y":102,"width":2,"height":2},{"x":140,"y":102,"width":2,"height":2},{"x":142,"y":102,"width":2,"height":2},{"x":144,"y":102,"width":2,"height":2},{"x":146,"y":102,"width":2,"height":2},{"x":148,"y":102,"width":2,"height":2},{"x":148,"y":104,"width":2,"height":2},{"x":146,"y":104,"width":2,"height":2},{"x":144,"y":104,"width":2,"height":2},{"x":142,"y":104,"width":2,"height":2},{"x":116,"y":94,"width":2,"height":2},{"x":114,"y":94,"width":2,"height":2},{"x":112,"y":94,"width":2,"height":2},{"x":110,"y":94,"width":2,"height":2},{"x":108,"y":94,"width":2,"height":2},{"x":106,"y":94,"width":2,"height":2},{"x":104,"y":94,"width":2,"height":2},{"x":102,"y":94,"width":2,"height":2},{"x":100,"y":94,"width":2,"height":2},{"x":98,"y":94,"width":2,"height":2},{"x":96,"y":94,"width":2,"height":2},{"x":96,"y":96,"width":2,"height":2},{"x":94,"y":96,"width":2,"height":2},{"x":96,"y":98,"width":2,"height":2},{"x":94,"y":98,"width":2,"height":2},{"x":96,"y":100,"width":2,"height":2},{"x":94,"y":94,"width":2,"height":2},{"x":94,"y":100,"width":2,"height":2},{"x":94,"y":102,"width":2,"height":2},{"x":94,"y":104,"width":2,"height":2},{"x":96,"y":104,"width":2,"height":2},{"x":96,"y":106,"width":2,"height":2},{"x":96,"y":108,"width":2,"height":2},{"x":96,"y":110,"width":2,"height":2},{"x":96,"y":112,"width":2,"height":2},{"x":94,"y":106,"width":2,"height":2},{"x":94,"y":108,"width":2,"height":2},{"x":94,"y":110,"width":2,"height":2},{"x":96,"y":114,"width":2,"height":2},{"x":96,"y":116,"width":2,"height":2},{"x":96,"y":118,"width":2,"height":2},{"x":98,"y":118,"width":2,"height":2},{"x":98,"y":120,"width":2,"height":2},{"x":94,"y":112,"width":2,"height":2},{"x":96,"y":120,"width":2,"height":2},{"x":94,"y":116,"width":2,"height":2},{"x":94,"y":114,"width":2,"height":2},{"x":94,"y":118,"width":2,"height":2},{"x":100,"y":118,"width":2,"height":2},{"x":102,"y":118,"width":2,"height":2},{"x":104,"y":116,"width":2,"height":2},{"x":104,"y":114,"width":2,"height":2},{"x":102,"y":114,"width":2,"height":2},{"x":102,"y":112,"width":2,"height":2},{"x":102,"y":110,"width":2,"height":2},{"x":100,"y":110,"width":2,"height":2},{"x":100,"y":108,"width":2,"height":2},{"x":100,"y":112,"width":2,"height":2},{"x":98,"y":114,"width":2,"height":2},{"x":98,"y":116,"width":2,"height":2},{"x":98,"y":112,"width":2,"height":2},{"x":98,"y":110,"width":2,"height":2},{"x":98,"y":108,"width":2,"height":2},{"x":98,"y":106,"width":2,"height":2},{"x":96,"y":102,"width":2,"height":2},{"x":98,"y":104,"width":2,"height":2},{"x":98,"y":102,"width":2,"height":2},{"x":100,"y":102,"width":2,"height":2},{"x":100,"y":100,"width":2,"height":2},{"x":100,"y":98,"width":2,"height":2},{"x":100,"y":96,"width":2,"height":2},{"x":98,"y":96,"width":2,"height":2},{"x":98,"y":98,"width":2,"height":2},{"x":98,"y":100,"width":2,"height":2},{"x":102,"y":98,"width":2,"height":2},{"x":104,"y":98,"width":2,"height":2},{"x":104,"y":100,"width":2,"height":2},{"x":102,"y":100,"width":2,"height":2},{"x":100,"y":114,"width":2,"height":2},{"x":100,"y":116,"width":2,"height":2},{"x":102,"y":124,"width":2,"height":2},{"x":100,"y":120,"width":2,"height":2},{"x":102,"y":108,"width":2,"height":2},{"x":104,"y":108,"width":2,"height":2},{"x":104,"y":106,"width":2,"height":2},{"x":104,"y":110,"width":2,"height":2},{"x":106,"y":112,"width":2,"height":2},{"x":106,"y":114,"width":2,"height":2},{"x":106,"y":116,"width":2,"height":2},{"x":106,"y":118,"width":2,"height":2},{"x":104,"y":118,"width":2,"height":2},{"x":102,"y":116,"width":2,"height":2},{"x":104,"y":120,"width":2,"height":2},{"x":106,"y":120,"width":2,"height":2},{"x":106,"y":122,"width":2,"height":2},{"x":108,"y":120,"width":2,"height":2},{"x":108,"y":118,"width":2,"height":2},{"x":108,"y":116,"width":2,"height":2},{"x":110,"y":116,"width":2,"height":2},{"x":110,"y":114,"width":2,"height":2},{"x":112,"y":114,"width":2,"height":2},{"x":112,"y":112,"width":2,"height":2},{"x":114,"y":110,"width":2,"height":2},{"x":116,"y":110,"width":2,"height":2},{"x":118,"y":108,"width":2,"height":2},{"x":120,"y":108,"width":2,"height":2},{"x":120,"y":106,"width":2,"height":2},{"x":122,"y":108,"width":2,"height":2},{"x":122,"y":110,"width":2,"height":2},{"x":118,"y":112,"width":2,"height":2},{"x":116,"y":112,"width":2,"height":2},{"x":114,"y":112,"width":2,"height":2},{"x":110,"y":112,"width":2,"height":2},{"x":108,"y":112,"width":2,"height":2},{"x":104,"y":112,"width":2,"height":2},{"x":108,"y":114,"width":2,"height":2},{"x":118,"y":110,"width":2,"height":2},{"x":116,"y":108,"width":2,"height":2},{"x":112,"y":110,"width":2,"height":2},{"x":110,"y":110,"width":2,"height":2},{"x":110,"y":108,"width":2,"height":2},{"x":108,"y":108,"width":2,"height":2},{"x":106,"y":108,"width":2,"height":2},{"x":102,"y":106,"width":2,"height":2},{"x":100,"y":106,"width":2,"height":2},{"x":106,"y":106,"width":2,"height":2},{"x":108,"y":110,"width":2,"height":2},{"x":106,"y":110,"width":2,"height":2},{"x":112,"y":108,"width":2,"height":2},{"x":114,"y":108,"width":2,"height":2},{"x":120,"y":104,"width":2,"height":2},{"x":118,"y":104,"width":2,"height":2},{"x":116,"y":102,"width":2,"height":2},{"x":116,"y":104,"width":2,"height":2},{"x":118,"y":106,"width":2,"height":2},{"x":114,"y":104,"width":2,"height":2},{"x":112,"y":104,"width":2,"height":2},{"x":110,"y":106,"width":2,"height":2},{"x":108,"y":106,"width":2,"height":2},{"x":106,"y":104,"width":2,"height":2},{"x":104,"y":104,"width":2,"height":2},{"x":102,"y":104,"width":2,"height":2},{"x":100,"y":104,"width":2,"height":2},{"x":108,"y":104,"width":2,"height":2},{"x":112,"y":106,"width":2,"height":2},{"x":114,"y":106,"width":2,"height":2},{"x":116,"y":106,"width":2,"height":2},{"x":110,"y":104,"width":2,"height":2},{"x":102,"y":102,"width":2,"height":2},{"x":104,"y":102,"width":2,"height":2},{"x":106,"y":102,"width":2,"height":2},{"x":108,"y":102,"width":2,"height":2},{"x":110,"y":102,"width":2,"height":2},{"x":112,"y":102,"width":2,"height":2},{"x":114,"y":102,"width":2,"height":2},{"x":116,"y":100,"width":2,"height":2},{"x":114,"y":100,"width":2,"height":2},{"x":112,"y":100,"width":2,"height":2},{"x":110,"y":100,"width":2,"height":2},{"x":108,"y":100,"width":2,"height":2},{"x":106,"y":100,"width":2,"height":2},{"x":104,"y":96,"width":2,"height":2},{"x":106,"y":96,"width":2,"height":2},{"x":108,"y":96,"width":2,"height":2},{"x":108,"y":98,"width":2,"height":2},{"x":110,"y":98,"width":2,"height":2},{"x":112,"y":98,"width":2,"height":2},{"x":114,"y":98,"width":2,"height":2},{"x":116,"y":98,"width":2,"height":2},{"x":116,"y":96,"width":2,"height":2},{"x":114,"y":96,"width":2,"height":2},{"x":112,"y":96,"width":2,"height":2},{"x":110,"y":96,"width":2,"height":2},{"x":102,"y":96,"width":2,"height":2},{"x":106,"y":98,"width":2,"height":2},{"x":70,"y":130,"width":2,"height":2},{"x":68,"y":130,"width":2,"height":2},{"x":66,"y":130,"width":2,"height":2},{"x":66,"y":128,"width":2,"height":2},{"x":64,"y":128,"width":2,"height":2},{"x":66,"y":126,"width":2,"height":2},{"x":64,"y":126,"width":2,"height":2},{"x":64,"y":124,"width":2,"height":2},{"x":64,"y":130,"width":2,"height":2},{"x":68,"y":128,"width":2,"height":2},{"x":70,"y":128,"width":2,"height":2},{"x":70,"y":126,"width":2,"height":2},{"x":70,"y":124,"width":2,"height":2},{"x":68,"y":124,"width":2,"height":2},{"x":66,"y":124,"width":2,"height":2},{"x":68,"y":126,"width":2,"height":2},{"x":94,"y":120,"width":2,"height":2},{"x":94,"y":122,"width":2,"height":2},{"x":94,"y":124,"width":2,"height":2},{"x":94,"y":126,"width":2,"height":2},{"x":94,"y":128,"width":2,"height":2},{"x":94,"y":130,"width":2,"height":2},{"x":94,"y":132,"width":2,"height":2},{"x":96,"y":134,"width":2,"height":2},{"x":96,"y":136,"width":2,"height":2},{"x":94,"y":136,"width":2,"height":2},{"x":94,"y":138,"width":2,"height":2},{"x":94,"y":134,"width":2,"height":2},{"x":94,"y":140,"width":2,"height":2},{"x":94,"y":142,"width":2,"height":2},{"x":94,"y":144,"width":2,"height":2},{"x":94,"y":146,"width":2,"height":2},{"x":94,"y":148,"width":2,"height":2},{"x":94,"y":150,"width":2,"height":2},{"x":94,"y":152,"width":2,"height":2},{"x":96,"y":152,"width":2,"height":2},{"x":96,"y":154,"width":2,"height":2},{"x":94,"y":154,"width":2,"height":2},{"x":94,"y":156,"width":2,"height":2},{"x":94,"y":158,"width":2,"height":2},{"x":96,"y":160,"width":2,"height":2},{"x":96,"y":158,"width":2,"height":2},{"x":98,"y":158,"width":2,"height":2},{"x":96,"y":156,"width":2,"height":2},{"x":96,"y":150,"width":2,"height":2},{"x":96,"y":148,"width":2,"height":2},{"x":96,"y":146,"width":2,"height":2},{"x":96,"y":144,"width":2,"height":2},{"x":96,"y":142,"width":2,"height":2},{"x":96,"y":140,"width":2,"height":2},{"x":96,"y":138,"width":2,"height":2},{"x":96,"y":132,"width":2,"height":2},{"x":96,"y":130,"width":2,"height":2},{"x":98,"y":122,"width":2,"height":2},{"x":98,"y":124,"width":2,"height":2},{"x":96,"y":122,"width":2,"height":2},{"x":100,"y":122,"width":2,"height":2},{"x":100,"y":124,"width":2,"height":2},{"x":100,"y":126,"width":2,"height":2},{"x":102,"y":126,"width":2,"height":2},{"x":102,"y":128,"width":2,"height":2},{"x":102,"y":130,"width":2,"height":2},{"x":102,"y":132,"width":2,"height":2},{"x":102,"y":134,"width":2,"height":2},{"x":102,"y":136,"width":2,"height":2},{"x":102,"y":138,"width":2,"height":2},{"x":102,"y":140,"width":2,"height":2},{"x":104,"y":142,"width":2,"height":2},{"x":104,"y":144,"width":2,"height":2},{"x":106,"y":146,"width":2,"height":2},{"x":106,"y":148,"width":2,"height":2},{"x":106,"y":150,"width":2,"height":2},{"x":108,"y":150,"width":2,"height":2},{"x":106,"y":152,"width":2,"height":2},{"x":106,"y":154,"width":2,"height":2},{"x":106,"y":156,"width":2,"height":2},{"x":108,"y":156,"width":2,"height":2},{"x":110,"y":156,"width":2,"height":2},{"x":110,"y":154,"width":2,"height":2},{"x":112,"y":150,"width":2,"height":2},{"x":112,"y":148,"width":2,"height":2},{"x":112,"y":144,"width":2,"height":2},{"x":112,"y":142,"width":2,"height":2},{"x":110,"y":138,"width":2,"height":2},{"x":108,"y":138,"width":2,"height":2},{"x":108,"y":136,"width":2,"height":2},{"x":110,"y":140,"width":2,"height":2},{"x":110,"y":142,"width":2,"height":2},{"x":114,"y":144,"width":2,"height":2},{"x":116,"y":146,"width":2,"height":2},{"x":116,"y":148,"width":2,"height":2},{"x":118,"y":148,"width":2,"height":2},{"x":118,"y":150,"width":2,"height":2},{"x":120,"y":152,"width":2,"height":2},{"x":122,"y":154,"width":2,"height":2},{"x":122,"y":156,"width":2,"height":2},{"x":124,"y":156,"width":2,"height":2},{"x":124,"y":158,"width":2,"height":2},{"x":124,"y":160,"width":2,"height":2},{"x":122,"y":160,"width":2,"height":2},{"x":120,"y":158,"width":2,"height":2},{"x":118,"y":158,"width":2,"height":2},{"x":118,"y":160,"width":2,"height":2},{"x":120,"y":160,"width":2,"height":2},{"x":116,"y":160,"width":2,"height":2},{"x":114,"y":160,"width":2,"height":2},{"x":112,"y":160,"width":2,"height":2},{"x":110,"y":160,"width":2,"height":2},{"x":108,"y":160,"width":2,"height":2},{"x":106,"y":160,"width":2,"height":2},{"x":104,"y":160,"width":2,"height":2},{"x":102,"y":160,"width":2,"height":2},{"x":100,"y":160,"width":2,"height":2},{"x":102,"y":158,"width":2,"height":2},{"x":104,"y":158,"width":2,"height":2},{"x":100,"y":158,"width":2,"height":2},{"x":98,"y":160,"width":2,"height":2},{"x":94,"y":160,"width":2,"height":2},{"x":98,"y":156,"width":2,"height":2},{"x":98,"y":154,"width":2,"height":2},{"x":98,"y":152,"width":2,"height":2},{"x":98,"y":150,"width":2,"height":2},{"x":98,"y":130,"width":2,"height":2},{"x":96,"y":128,"width":2,"height":2},{"x":96,"y":126,"width":2,"height":2},{"x":96,"y":124,"width":2,"height":2},{"x":98,"y":126,"width":2,"height":2},{"x":100,"y":128,"width":2,"height":2},{"x":98,"y":128,"width":2,"height":2},{"x":98,"y":132,"width":2,"height":2},{"x":98,"y":134,"width":2,"height":2},{"x":98,"y":136,"width":2,"height":2},{"x":98,"y":138,"width":2,"height":2},{"x":98,"y":140,"width":2,"height":2},{"x":98,"y":142,"width":2,"height":2},{"x":98,"y":144,"width":2,"height":2},{"x":100,"y":154,"width":2,"height":2},{"x":100,"y":156,"width":2,"height":2},{"x":100,"y":152,"width":2,"height":2},{"x":100,"y":148,"width":2,"height":2},{"x":100,"y":146,"width":2,"height":2},{"x":100,"y":144,"width":2,"height":2},{"x":98,"y":148,"width":2,"height":2},{"x":98,"y":146,"width":2,"height":2},{"x":100,"y":150,"width":2,"height":2},{"x":102,"y":154,"width":2,"height":2},{"x":102,"y":156,"width":2,"height":2},{"x":100,"y":142,"width":2,"height":2},{"x":100,"y":140,"width":2,"height":2},{"x":100,"y":138,"width":2,"height":2},{"x":100,"y":136,"width":2,"height":2},{"x":100,"y":134,"width":2,"height":2},{"x":100,"y":130,"width":2,"height":2},{"x":100,"y":132,"width":2,"height":2},{"x":102,"y":148,"width":2,"height":2},{"x":102,"y":146,"width":2,"height":2},{"x":102,"y":144,"width":2,"height":2},{"x":102,"y":142,"width":2,"height":2},{"x":104,"y":140,"width":2,"height":2},{"x":104,"y":148,"width":2,"height":2},{"x":104,"y":150,"width":2,"height":2},{"x":104,"y":152,"width":2,"height":2},{"x":104,"y":156,"width":2,"height":2},{"x":102,"y":152,"width":2,"height":2},{"x":102,"y":150,"width":2,"height":2},{"x":104,"y":154,"width":2,"height":2},{"x":106,"y":158,"width":2,"height":2},{"x":108,"y":158,"width":2,"height":2},{"x":110,"y":158,"width":2,"height":2},{"x":112,"y":158,"width":2,"height":2},{"x":112,"y":156,"width":2,"height":2},{"x":114,"y":156,"width":2,"height":2},{"x":114,"y":158,"width":2,"height":2},{"x":116,"y":158,"width":2,"height":2},{"x":122,"y":158,"width":2,"height":2},{"x":118,"y":156,"width":2,"height":2},{"x":116,"y":156,"width":2,"height":2},{"x":108,"y":154,"width":2,"height":2},{"x":112,"y":154,"width":2,"height":2},{"x":114,"y":154,"width":2,"height":2},{"x":116,"y":154,"width":2,"height":2},{"x":118,"y":154,"width":2,"height":2},{"x":120,"y":154,"width":2,"height":2},{"x":124,"y":154,"width":2,"height":2},{"x":120,"y":156,"width":2,"height":2},{"x":124,"y":152,"width":2,"height":2},{"x":122,"y":152,"width":2,"height":2},{"x":124,"y":150,"width":2,"height":2},{"x":124,"y":148,"width":2,"height":2},{"x":122,"y":144,"width":2,"height":2},{"x":122,"y":142,"width":2,"height":2},{"x":122,"y":146,"width":2,"height":2},{"x":122,"y":150,"width":2,"height":2},{"x":120,"y":148,"width":2,"height":2},{"x":120,"y":146,"width":2,"height":2},{"x":120,"y":144,"width":2,"height":2},{"x":120,"y":142,"width":2,"height":2},{"x":118,"y":140,"width":2,"height":2},{"x":122,"y":148,"width":2,"height":2},{"x":120,"y":150,"width":2,"height":2},{"x":118,"y":152,"width":2,"height":2},{"x":116,"y":152,"width":2,"height":2},{"x":116,"y":150,"width":2,"height":2},{"x":116,"y":144,"width":2,"height":2},{"x":116,"y":142,"width":2,"height":2},{"x":116,"y":140,"width":2,"height":2},{"x":116,"y":138,"width":2,"height":2},{"x":118,"y":142,"width":2,"height":2},{"x":118,"y":144,"width":2,"height":2},{"x":114,"y":134,"width":2,"height":2},{"x":118,"y":146,"width":2,"height":2},{"x":114,"y":142,"width":2,"height":2},{"x":112,"y":136,"width":2,"height":2},{"x":112,"y":134,"width":2,"height":2},{"x":110,"y":134,"width":2,"height":2},{"x":110,"y":132,"width":2,"height":2},{"x":108,"y":132,"width":2,"height":2},{"x":106,"y":130,"width":2,"height":2},{"x":108,"y":134,"width":2,"height":2},{"x":110,"y":136,"width":2,"height":2},{"x":106,"y":132,"width":2,"height":2},{"x":104,"y":128,"width":2,"height":2},{"x":104,"y":126,"width":2,"height":2},{"x":104,"y":130,"width":2,"height":2},{"x":104,"y":132,"width":2,"height":2},{"x":104,"y":134,"width":2,"height":2},{"x":104,"y":136,"width":2,"height":2},{"x":104,"y":138,"width":2,"height":2},{"x":104,"y":146,"width":2,"height":2},{"x":108,"y":148,"width":2,"height":2},{"x":108,"y":152,"width":2,"height":2},{"x":106,"y":144,"width":2,"height":2},{"x":106,"y":142,"width":2,"height":2},{"x":106,"y":140,"width":2,"height":2},{"x":106,"y":138,"width":2,"height":2},{"x":106,"y":136,"width":2,"height":2},{"x":106,"y":134,"width":2,"height":2},{"x":108,"y":140,"width":2,"height":2},{"x":108,"y":142,"width":2,"height":2},{"x":108,"y":144,"width":2,"height":2},{"x":108,"y":146,"width":2,"height":2},{"x":110,"y":152,"width":2,"height":2},{"x":110,"y":150,"width":2,"height":2},{"x":110,"y":148,"width":2,"height":2},{"x":110,"y":146,"width":2,"height":2},{"x":110,"y":144,"width":2,"height":2},{"x":112,"y":146,"width":2,"height":2},{"x":112,"y":152,"width":2,"height":2},{"x":114,"y":150,"width":2,"height":2},{"x":114,"y":148,"width":2,"height":2},{"x":114,"y":146,"width":2,"height":2},{"x":114,"y":152,"width":2,"height":2},{"x":130,"y":190,"width":2,"height":2},{"x":128,"y":190,"width":2,"height":2},{"x":126,"y":190,"width":2,"height":2},{"x":124,"y":190,"width":2,"height":2},{"x":124,"y":188,"width":2,"height":2},{"x":124,"y":186,"width":2,"height":2},{"x":126,"y":186,"width":2,"height":2},{"x":126,"y":184,"width":2,"height":2},{"x":124,"y":184,"width":2,"height":2},{"x":128,"y":186,"width":2,"height":2},{"x":130,"y":186,"width":2,"height":2},{"x":130,"y":184,"width":2,"height":2},{"x":128,"y":184,"width":2,"height":2},{"x":130,"y":188,"width":2,"height":2}]
    };

    // Application State
    let currentMode = 'gotham';
    let placedBases = [];

    // Camera State
    let camera = { x: 0, y: 0, scale: 1 };
    let isDragging = false;
    let hasDragged = false;
    let dragStart = { x: 0, y: 0 };

    // --- ADMIN PAINTER STATE ---
    let adminMode = false;
    let adminTool = 'pan'; 
    let isPainting = false;

    // Building Presets Data
    const presets = {
        cityHall: { coords: [[128, 128]], imageKey: 'cityHall' },
        plazas: { coords: [[68, 128], [98, 98], [128, 68], [158, 98], [188, 128], [158, 158], [128, 188], [98, 158]], imageKey: 'plaza' },
        armories: { coords: [[100, 122], [122, 98], [135, 156], [157, 135]], imageKey: 'armory' },
        ultimateArmories: { coords: [[108, 147], [147, 108]], imageKey: 'armory' }
    };

    // --- INITIALIZATION (WAIT FOR FIREBASE) ---
    document.addEventListener('firebase-ready', () => {
        try {
            const app = getApp();
            auth = getAuth(app);
            db = getFirestore(app);

            preloadImages(() => {
                init();
            });
        } catch (e) {
            console.error("Gotham Planner: Firebase initialization failed.", e);
        }
    }, { once: true });


    function preloadImages(onComplete) {
        let loadedCount = 0;
        const keys = Object.keys(imagePaths);
        if (keys.length === 0) return onComplete();
        keys.forEach(key => {
            const img = new Image();
            img.src = imagePaths[key];
            img.onload = () => { loadedImages[key] = img; loadedCount++; if (loadedCount === keys.length) onComplete(); };
            img.onerror = () => { console.error(`Failed to load image: ${imagePaths[key]}`); loadedCount++; if (loadedCount === keys.length) onComplete(); };
        });
    }

    function init() {
        buildAdminUI();
        bindEvents();
        
        const centerPos = isoToWorld(128, 128);
        camera.x = (canvas.width / 2) - (centerPos.x * camera.scale);
        camera.y = (canvas.height / 2) - (centerPos.y * camera.scale);
        
        drawMap();

        // Listen for user login, then fetch their map data
        onAuthStateChanged(auth, (user) => {
            if (user) {
                loadMapData(currentMode);
            }
        });
    }

    function bindEvents() {
        document.getElementById('mode-select').addEventListener('change', async (e) => { 
            currentMode = e.target.value; 
            if (auth && auth.currentUser) {
                await loadMapData(currentMode);
            } else {
                placedBases = []; 
                updateLegendUI(); 
                drawMap(); 
            }
        });

        document.getElementById('btn-save').addEventListener('click', saveMapData);
        document.getElementById('btn-clear').addEventListener('click', () => { placedBases = []; updateLegendUI(); drawMap(); });
        document.getElementById('btn-export').addEventListener('click', exportCombinedImage);

        canvas.addEventListener('wheel', handleZoom, { passive: false });
        canvas.addEventListener('mousedown', handlePointerDown);
        window.addEventListener('mousemove', handlePointerMove);
        window.addEventListener('mouseup', handlePointerUp);

        window.addEventListener('keydown', (e) => {
            if (e.ctrlKey && e.shiftKey && e.key.toLowerCase() === 'a') {
                adminMode = !adminMode;
                document.getElementById('dev-admin-panel').style.display = adminMode ? 'flex' : 'none';
                if (!adminMode) adminTool = 'pan'; 
                drawMap();
            }
        });
    }

    // --- FIREBASE SAVE & LOAD LOGIC ---
    async function saveMapData() {
        if (!auth || !db) return;
        const user = auth.currentUser;
        if (!user) {
            alert("You must be logged in to save your map.");
            return;
        }

        const btn = document.getElementById('btn-save');
        btn.innerText = "Saving...";

        try {
            const mapRef = doc(db, "users", user.uid, "maps", currentMode);
            await setDoc(mapRef, {
                bases: placedBases,
                updatedAt: new Date()
            });
            btn.innerText = "Saved!";
            setTimeout(() => btn.innerText = "Save to Profile", 2000);
        } catch (error) {
            console.error("Error saving map:", error);
            alert("Failed to save map.");
            btn.innerText = "Save to Profile";
        }
    }

    async function loadMapData(mode) {
        if (!auth || !db) return;
        const user = auth.currentUser;
        if (!user) return;

        try {
            const mapRef = doc(db, "users", user.uid, "maps", mode);
            const mapSnap = await getDoc(mapRef);
            
            if (mapSnap.exists()) {
                placedBases = mapSnap.data().bases || [];
            } else {
                placedBases = []; 
            }
            
            updateLegendUI();
            drawMap();
        } catch (error) {
            console.error("Error loading map:", error);
        }
    }

    // --- ISOMETRIC MATH HELPERS ---
    function isoToWorld(gridX, gridY) { return { x: (gridX - gridY) * (TILE_W / 2), y: (gridX + gridY) * (TILE_H / 2) }; }
    function worldToIso(worldX, worldY) { return { x: (worldY / (TILE_H / 2) + worldX / (TILE_W / 2)) / 2, y: (worldY / (TILE_H / 2) - worldX / (TILE_W / 2)) / 2 }; }

    function getMousePos(e) {
        const rect = canvas.getBoundingClientRect();
        const scaleX = canvas.width / rect.width;
        const scaleY = canvas.height / rect.height;
        return { x: (e.clientX - rect.left) * scaleX, y: (e.clientY - rect.top) * scaleY };
    }

    // --- PAN, ZOOM, AND PAINTER LOGIC ---
    function handleZoom(e) {
        e.preventDefault();
        const pos = getMousePos(e);
        const zoomFactor = e.deltaY < 0 ? 1.1 : 0.9;
        const worldX = (pos.x - camera.x) / camera.scale;
        const worldY = (pos.y - camera.y) / camera.scale;
        camera.scale = Math.max(0.5, Math.min(camera.scale * zoomFactor, 10));
        camera.x = pos.x - worldX * camera.scale;
        camera.y = pos.y - worldY * camera.scale;
        drawMap();
    }

    function handlePointerDown(e) {
        if (e.target !== canvas) return;
        
        if (adminMode && adminTool !== 'pan') {
            isPainting = true;
            paintOrEraseTile(e);
            return;
        }

        isDragging = true;
        hasDragged = false;
        const pos = getMousePos(e);
        dragStart = { x: pos.x - camera.x, y: pos.y - camera.y };
    }

    function handlePointerMove(e) {
        if (adminMode && isPainting) {
            paintOrEraseTile(e);
            return;
        }

        if (!isDragging) return;
        const pos = getMousePos(e);
        const newCameraX = pos.x - dragStart.x;
        const newCameraY = pos.y - dragStart.y;
        if (Math.abs(newCameraX - camera.x) > 3 || Math.abs(newCameraY - camera.y) > 3) hasDragged = true;
        camera.x = newCameraX;
        camera.y = newCameraY;
        drawMap();
    }

    function handlePointerUp(e) {
        if (isPainting) {
            isPainting = false;
            return;
        }
        if (!isDragging) return;
        isDragging = false;
        if (!hasDragged && e.target === canvas && !adminMode) {
            processMapClick(e);
        }
    }

    function paintOrEraseTile(e) {
        const pos = getMousePos(e);
        const worldX = (pos.x - camera.x) / camera.scale;
        const worldY = (pos.y - camera.y) / camera.scale;
        const gridPos = worldToIso(worldX, worldY);
        
        const gridX = Math.floor(gridPos.x / 2) * 2;
        const gridY = Math.floor(gridPos.y / 2) * 2;

        if (gridX < 0 || gridY < 0 || gridX >= GRID_SIZE || gridY >= GRID_SIZE) return;

        const existingIndex = mapConfig.outOfBoundsAreas.findIndex(a => a.x === gridX && a.y === gridY);

        if (adminTool === 'paint' && existingIndex === -1) {
            mapConfig.outOfBoundsAreas.push({ x: gridX, y: gridY, width: 2, height: 2 });
            drawMap();
        } else if (adminTool === 'erase' && existingIndex !== -1) {
            mapConfig.outOfBoundsAreas.splice(existingIndex, 1);
            drawMap();
        }
    }

    // --- PLACEMENT LOGIC ---
    function getNextAvailableId() {
        let id = 1;
        const usedIds = new Set(placedBases.map(b => b.id));
        while (usedIds.has(id)) id++;
        return id;
    }

    function processMapClick(e) {
        const pos = getMousePos(e);
        const worldX = (pos.x - camera.x) / camera.scale;
        const worldY = (pos.y - camera.y) / camera.scale;
        const gridPos = worldToIso(worldX, worldY);

        const gridX = Math.floor(gridPos.x / 2) * 2;
        const gridY = Math.floor(gridPos.y / 2) * 2;

        if (gridX < 0 || gridY < 0 || gridX >= GRID_SIZE || gridY >= GRID_SIZE) return;

        const clickedBaseIndex = placedBases.findIndex(b => gridX >= b.gridX && gridX < b.gridX + 2 && gridY >= b.gridY && gridY < b.gridY + 2);

        if (clickedBaseIndex !== -1) {
            placedBases.splice(clickedBaseIndex, 1);
            updateLegendUI();
            drawMap();
            return;
        }

        if (!isPlacementValid(gridX, gridY)) {
            canvas.style.border = "2px solid red";
            setTimeout(() => canvas.style.border = "1px solid var(--border-color, #333)", 300);
            return;
        }

        placedBases.push({ id: getNextAvailableId(), gridX: gridX, gridY: gridY, playerName: '' });
        placedBases.sort((a, b) => a.id - b.id);
        updateLegendUI();
        drawMap();
    }

    function isAABBIntersecting(ax, ay, aw, ah, bx, by, bw, bh) {
        return ax < bx + bw && ax + aw > bx && ay < by + bh && ay + ah > by;
    }

    function isPlacementValid(gridX, gridY) {
        const baseW = 2, baseH = 2;
        for (let bounds of mapConfig.outOfBoundsAreas) {
            if (isAABBIntersecting(gridX, gridY, baseW, baseH, bounds.x, bounds.y, bounds.width, bounds.height)) return false;
        }
        const checkCollision = (coords, size) => {
            for (let [cx, cy] of coords) {
                const bX = cx - (size / 2);
                const bY = cy - (size / 2);
                if (isAABBIntersecting(gridX, gridY, baseW, baseH, bX, bY, size, size)) return true;
            }
            return false;
        };
        if (checkCollision(presets.cityHall.coords, mapConfig.buildings.cityHall.grid)) return false;
        if (checkCollision(presets.plazas.coords, mapConfig.buildings.plaza.grid)) return false;
        if (checkCollision(presets.armories.coords, mapConfig.buildings.armory.grid)) return false;
        if (currentMode === 'ultimate' && checkCollision(presets.ultimateArmories.coords, mapConfig.buildings.armory.grid)) return false;
        return true;
    }

    // --- RENDERING ---
    function drawMap(cTarget = ctx, useCamera = true) {
        cTarget.setTransform(1, 0, 0, 1, 0, 0);
        cTarget.clearRect(0, 0, cTarget.canvas.width, cTarget.canvas.height);

        cTarget.fillStyle = '#1a1a1a';
        cTarget.fillRect(0, 0, cTarget.canvas.width, cTarget.canvas.height);

        if (useCamera) {
            cTarget.translate(camera.x, camera.y);
            cTarget.scale(camera.scale, camera.scale);
        } else {
            cTarget.translate((GRID_SIZE * TILE_W) / 2, 50);
        }

        drawGridLines(cTarget, useCamera);

        cTarget.fillStyle = 'rgba(255, 0, 0, 0.4)'; 
        mapConfig.outOfBoundsAreas.forEach(area => {
            let p1 = isoToWorld(area.x, area.y);
            let p2 = isoToWorld(area.x + area.width, area.y);
            let p3 = isoToWorld(area.x + area.width, area.y + area.height);
            let p4 = isoToWorld(area.x, area.y + area.height);
            cTarget.beginPath();
            cTarget.moveTo(p1.x, p1.y);
            cTarget.lineTo(p2.x, p2.y);
            cTarget.lineTo(p3.x, p3.y);
            cTarget.lineTo(p4.x, p4.y);
            cTarget.fill();
        });

        drawPresetGroup(cTarget, presets.cityHall.coords, mapConfig.buildings.cityHall, presets.cityHall.imageKey);
        drawPresetGroup(cTarget, presets.plazas.coords, mapConfig.buildings.plaza, presets.plazas.imageKey);
        drawPresetGroup(cTarget, presets.armories.coords, mapConfig.buildings.armory, presets.armories.imageKey);
        if (currentMode === 'ultimate') drawPresetGroup(cTarget, presets.ultimateArmories.coords, mapConfig.buildings.armory, presets.ultimateArmories.imageKey);

        placedBases.forEach(base => {
            const center = isoToWorld(base.gridX + 1, base.gridY + 1);
            cTarget.fillStyle = '#e74c3c';
            cTarget.beginPath();
            cTarget.moveTo(center.x, center.y - TILE_H);
            cTarget.lineTo(center.x + TILE_W, center.y);
            cTarget.lineTo(center.x, center.y + TILE_H);
            cTarget.lineTo(center.x - TILE_W, center.y);
            cTarget.fill();
            
            cTarget.fillStyle = '#ffffff';
            cTarget.font = 'bold 8px Arial';
            cTarget.textAlign = 'center';
            cTarget.textBaseline = 'middle';
            cTarget.fillText(base.id, center.x, center.y);
        });

        cTarget.setTransform(1, 0, 0, 1, 0, 0);
    }

    function drawGridLines(cTarget, useCamera) {
        cTarget.strokeStyle = '#333';
        cTarget.lineWidth = useCamera ? 1 / camera.scale : 1; 
        cTarget.beginPath();
        for (let i = 0; i <= GRID_SIZE; i += 2) { 
            let start = isoToWorld(0, i);
            let end = isoToWorld(GRID_SIZE, i);
            cTarget.moveTo(start.x, start.y);
            cTarget.lineTo(end.x, end.y);
            start = isoToWorld(i, 0);
            end = isoToWorld(i, GRID_SIZE);
            cTarget.moveTo(start.x, start.y);
            cTarget.lineTo(end.x, end.y);
        }
        cTarget.stroke();
    }

    function drawPresetGroup(cTarget, coords, config, imageKey) {
        const img = loadedImages[imageKey];
        const footprintWidth = config.grid * TILE_W;
        const footprintHeight = config.grid * TILE_H;

        const offX = config.offsetX || 0;
        const offY = config.offsetY || 0;
        const flip = config.flip || false;

        coords.forEach(([cx, cy]) => {
            const pos = isoToWorld(cx, cy);

            cTarget.fillStyle = 'rgba(255, 255, 255, 0.05)';
            cTarget.strokeStyle = 'rgba(255, 255, 255, 0.3)';
            cTarget.lineWidth = 1;
            cTarget.beginPath();
            cTarget.moveTo(pos.x, pos.y - (footprintHeight/2));
            cTarget.lineTo(pos.x + (footprintWidth/2), pos.y);
            cTarget.lineTo(pos.x, pos.y + (footprintHeight/2));
            cTarget.lineTo(pos.x - (footprintWidth/2), pos.y);
            cTarget.fill();
            cTarget.stroke();

            if (img) {
                const imgWidth = footprintWidth * config.imgScale;
                const imgHeight = footprintHeight * config.imgScale;

                if (flip) {
                    cTarget.save();
                    cTarget.translate(pos.x + offX, pos.y + offY);
                    cTarget.scale(-1, 1);
                    cTarget.drawImage(img, -imgWidth / 2, -imgHeight / 2, imgWidth, imgHeight);
                    cTarget.restore();
                } else {
                    cTarget.drawImage(img, pos.x - (imgWidth / 2) + offX, pos.y - (imgHeight / 2) + offY, imgWidth, imgHeight);
                }
            }
        });
    }

    function updateLegendUI() {
        legendContainer.innerHTML = '';
        placedBases.forEach(base => {
            const div = document.createElement('div');
            div.className = 'legend-item';
            const numSpan = document.createElement('span');
            numSpan.innerText = base.id;
            const input = document.createElement('input');
            input.type = 'text';
            input.placeholder = `Player ${base.id} Name`;
            input.value = base.playerName;
            input.className = 'dcdl-input'; 
            input.addEventListener('input', (e) => base.playerName = e.target.value);
            div.appendChild(numSpan);
            div.appendChild(input);
            legendContainer.appendChild(div);
        });
    }

    function exportCombinedImage() {
        const exportCanvas = document.createElement('canvas');
        const legendWidth = 350;
        const mapWorldWidth = GRID_SIZE * TILE_W;
        const mapWorldHeight = GRID_SIZE * TILE_H;
        exportCanvas.width = mapWorldWidth + legendWidth + 100; 
        exportCanvas.height = Math.max(mapWorldHeight + 100, 800); 
        const eCtx = exportCanvas.getContext('2d');

        drawMap(eCtx, false); 

        eCtx.setTransform(1, 0, 0, 1, 0, 0);
        
        eCtx.fillStyle = '#111';
        eCtx.fillRect(mapWorldWidth + 50, 0, legendWidth + 50, exportCanvas.height);
        
        // Reset text alignment for the legend
        eCtx.textAlign = 'left';
        eCtx.textBaseline = 'alphabetic';

        eCtx.fillStyle = '#00d2ff';
        eCtx.font = 'bold 32px Arial';
        eCtx.fillText('Player Bases', mapWorldWidth + 70, 50);
        
        eCtx.fillStyle = '#ffffff';
        eCtx.font = '20px Arial';
        let yOffset = 100;
        placedBases.forEach(base => {
            const name = base.playerName.trim() === '' ? `Player ${base.id}` : base.playerName;
            eCtx.fillText(`[${base.id}] - ${name}`, mapWorldWidth + 70, yOffset);
            yOffset += 40;
        });

        const link = document.createElement('a');
        link.download = `dcdl-map-${currentMode}.png`;
        link.href = exportCanvas.toDataURL("image/png");
        link.click();
    }

    function buildAdminUI() {
        const panel = document.createElement('div');
        panel.id = 'dev-admin-panel';
        panel.style.cssText = `
            position: fixed; top: 80px; left: 50%; transform: translateX(-50%);
            background: #d32f2f; padding: 10px 20px; border-radius: 8px; border: 2px solid #fff;
            display: none; gap: 10px; z-index: 9999; box-shadow: 0 4px 15px rgba(0,0,0,0.5);
            align-items: center; color: white; font-family: sans-serif;
        `;
        
        const title = document.createElement('strong');
        title.innerText = 'Admin Tools: ';
        
        const btnPan = document.createElement('button');
        btnPan.innerText = 'Pan Camera';
        btnPan.style.cssText = 'padding:5px 10px; cursor:pointer; background:#111; color:white; border:1px solid #fff; font-weight:bold;';
        
        const btnPaint = document.createElement('button');
        btnPaint.innerText = 'Paint (2x2)';
        btnPaint.style.cssText = 'padding:5px 10px; cursor:pointer; background:#111; color:white; border:1px solid #fff;';
        
        const btnErase = document.createElement('button');
        btnErase.innerText = 'Erase';
        btnErase.style.cssText = 'padding:5px 10px; cursor:pointer; background:#111; color:white; border:1px solid #fff;';
        
        const btnExport = document.createElement('button');
        btnExport.innerText = 'Export JSON';
        btnExport.style.cssText = 'padding:5px 10px; cursor:pointer; background:#fff; color:#d32f2f; border:1px solid #111; font-weight:bold; margin-left: 20px;';

        const setTool = (tool, activeBtn) => {
            adminTool = tool;
            [btnPan, btnPaint, btnErase].forEach(b => b.style.fontWeight = 'normal');
            activeBtn.style.fontWeight = 'bold';
            canvas.style.cursor = tool === 'pan' ? 'grab' : 'crosshair';
        };

        btnPan.onclick = () => setTool('pan', btnPan);
        btnPaint.onclick = () => setTool('paint', btnPaint);
        btnErase.onclick = () => setTool('erase', btnErase);
        btnExport.onclick = () => {
            const dataStr = JSON.stringify(mapConfig.outOfBoundsAreas);
            const blob = new Blob([dataStr], { type: "application/json" });
            const url = URL.createObjectURL(blob);
            const link = document.createElement('a');
            link.download = "dcdl-map-bounds.json";
            link.href = url;
            link.click();
            URL.revokeObjectURL(url);
            alert("Downloaded map-bounds.json! Open it in Notepad/VS Code and copy the full text.");
        };

        panel.appendChild(title);
        panel.appendChild(btnPan);
        panel.appendChild(btnPaint);
        panel.appendChild(btnErase);
        panel.appendChild(btnExport);
        document.body.appendChild(panel);
    }
});