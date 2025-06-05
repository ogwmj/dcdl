#!/bin/bash

# --- Batch PNG to WebP Conversion Script ---
# This script converts all .png files in the current directory to .webp format
# using the cwebp command-line tool. It retains the original filenames
# (changing the extension to .webp) and uses a quality setting of 80.

# Check if cwebp command is available
if ! command -v cwebp &> /dev/null
then
    echo "Error: 'cwebp' command not found." >&2
    echo "Please install the webp tools. For example:" >&2
    echo "  On Debian/Ubuntu: sudo apt-get install webp" >&2
    echo "  On macOS (using Homebrew): brew install webp" >&2
    echo "  For other systems, please check your package manager or visit:" >&2
    echo "  https://developers.google.com/speed/webp/docs/precompiled" >&2
    exit 1
fi

echo "Starting batch PNG to WebP conversion (quality 80)..."
echo "Output files will be saved in the current directory."

# Enable nullglob: if no *.png files are found, the loop won't run
# and 'png_file' won't be assigned the literal string "*.png".
shopt -s nullglob

converted_count=0
error_count=0
skipped_count=0
found_png_files=0

# Loop through all files ending with .png (case-insensitive) in the current directory
for png_file in *.png *.PNG; do
    # This check is necessary because with nullglob, if no files match *.png but some match *.PNG,
    # the first iteration for *.png would be skipped, but we still want to count found files accurately.
    # However, nullglob handles the case where NEITHER matches by not entering the loop.
    # This ensures we only proceed if a file actually exists.
    if [ ! -f "$png_file" ]; then
        continue # Should not happen with nullglob if a file matched
    fi

    ((found_png_files++))

    # Get the filename without the .png or .PNG extension
    # ${variable%.*} removes the shortest suffix matching .*
    # To be robust for ".image.png", we target specific extensions.
    if [[ "$png_file" == *.png ]]; then
        filename_no_ext="${png_file%.png}"
    elif [[ "$png_file" == *.PNG ]]; then
        filename_no_ext="${png_file%.PNG}"
    else
        # This case should ideally not be reached if the loop is *.png *.PNG
        echo "Warning: Skipped file with unexpected extension pattern: \"$png_file\"" >&2
        ((skipped_count++))
        continue
    fi

    # Define the output WebP filename
    webp_file="${filename_no_ext}.webp"

    echo "----------------------------------------"
    echo "Processing: \"$png_file\""

    # Check if the output file already exists
    if [ -f "$webp_file" ]; then
        echo "Skipped: Output file \"$webp_file\" already exists."
        ((skipped_count++))
        continue
    fi

    # Run the cwebp command
    # -q 80 sets the quality to 80.
    # Quoting filenames handles spaces or special characters.
    if cwebp -q 80 "$png_file" -o "$webp_file"; then
        echo "Successfully converted to: \"$webp_file\""
        ((converted_count++))
    else
        echo "Error: Failed to convert \"$png_file\". cwebp command exited with an error." >&2
        # Optionally, remove a partially created/failed output file
        # rm -f "$webp_file"
        ((error_count++))
    fi
done

# Disable nullglob to restore default shell behavior
shopt -u nullglob

echo "----------------------------------------"
echo "Batch conversion summary:"
if [ "$found_png_files" -eq 0 ]; then
    echo "No .png files found in the current directory to process."
else
    echo "Processed $found_png_files .png file(s)."
    echo "Successfully converted: $converted_count file(s)."
    if [ "$skipped_count" -gt 0 ]; then
        echo "Skipped (e.g., output exists or unexpected name): $skipped_count file(s)."
    fi
    if [ "$error_count" -gt 0 ]; then
        echo "Failed to convert: $error_count file(s)." >&2
    fi
fi
echo "Conversion process finished."

