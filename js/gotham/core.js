document.addEventListener("DOMContentLoaded", () => {
    const canvas = document.getElementById('map-canvas');
    const ctx = canvas.getContext('2d');
    const legendContainer = document.getElementById('player-legend');
    
    // Grid & Resolution limits
    const GRID_SIZE = 256;
    const CANVAS_SIZE = 1024;
    const PIXELS_PER_TILE = CANVAS_SIZE / GRID_SIZE; // 4 pixels

    // --- ASSET MANAGEMENT ---
    // Update these paths to match your exact file extensions (.png, .webp, etc.)
    const imagePaths = {
        cityHall: 'img/gotham/cityhall.webp',
        plaza: 'img/gotham/plazas.webp',
        armory: 'img/gotham/armories.webp'
    };
    const loadedImages = {};

    // Simulated Firestore Configuration Data
    const mapConfig = {
        sizes: {
            cityHall: 12,
            plaza: 6,
            armory: 4
        },
        outOfBoundsAreas: []
    };

    // Application State
    let currentMode = 'gotham';
    let placedBases = [];

    // Camera (Pan/Zoom) State
    let camera = { x: 0, y: 0, scale: 1 };
    let isDragging = false;
    let hasDragged = false;
    let dragStart = { x: 0, y: 0 };

    // Building Presets Data (Now referencing Image Keys instead of Colors)
    const presets = {
        cityHall: { coords: [[128, 128]], imageKey: 'cityHall' },
        plazas: { coords: [[68, 128], [98, 98], [128, 68], [158, 98], [188, 128], [158, 158], [128, 188], [98, 158]], imageKey: 'plaza' },
        armories: { coords: [[100, 122], [122, 98], [135, 156], [157, 135]], imageKey: 'armory' },
        ultimateArmories: { coords: [[108, 147], [147, 108]], imageKey: 'armory' }
    };

    // Preload Images before initializing the app
    preloadImages(() => {
        init();
    });

    function preloadImages(onComplete) {
        let loadedCount = 0;
        const keys = Object.keys(imagePaths);
        
        if (keys.length === 0) return onComplete();

        keys.forEach(key => {
            const img = new Image();
            img.src = imagePaths[key];
            img.onload = () => {
                loadedImages[key] = img;
                loadedCount++;
                if (loadedCount === keys.length) onComplete();
            };
            img.onerror = () => {
                console.error(`Failed to load image: ${imagePaths[key]}`);
                // Still increment so the app doesn't hang forever if one image fails
                loadedCount++;
                if (loadedCount === keys.length) onComplete();
            };
        });
    }

    function init() {
        bindEvents();
        drawMap();
    }

    function bindEvents() {
        document.getElementById('mode-select').addEventListener('change', (e) => {
            currentMode = e.target.value;
            drawMap();
        });

        document.getElementById('btn-clear').addEventListener('click', () => {
            placedBases = [];
            updateLegendUI();
            drawMap();
        });

        document.getElementById('btn-export').addEventListener('click', exportCombinedImage);

        canvas.addEventListener('wheel', handleZoom);
        canvas.addEventListener('mousedown', handlePointerDown);
        window.addEventListener('mousemove', handlePointerMove);
        window.addEventListener('mouseup', handlePointerUp);
    }

    // --- HELPER: GET TRUE MOUSE POSITION ---
    function getMousePos(e) {
        const rect = canvas.getBoundingClientRect();
        const scaleX = canvas.width / rect.width;
        const scaleY = canvas.height / rect.height;

        return {
            x: (e.clientX - rect.left) * scaleX,
            y: (e.clientY - rect.top) * scaleY
        };
    }

    // --- PAN AND ZOOM LOGIC ---
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
        isDragging = true;
        hasDragged = false;
        const pos = getMousePos(e);
        dragStart = { x: pos.x - camera.x, y: pos.y - camera.y };
    }

    function handlePointerMove(e) {
        if (!isDragging) return;
        
        const pos = getMousePos(e);
        const newCameraX = pos.x - dragStart.x;
        const newCameraY = pos.y - dragStart.y;
        
        if (Math.abs(newCameraX - camera.x) > 3 || Math.abs(newCameraY - camera.y) > 3) {
            hasDragged = true;
        }

        camera.x = newCameraX;
        camera.y = newCameraY;
        drawMap();
    }

    function handlePointerUp(e) {
        if (!isDragging) return;
        isDragging = false;

        if (!hasDragged && e.target === canvas) {
            processMapClick(e);
        }
    }

    // --- PLACEMENT LOGIC ---
    function getNextAvailableId() {
        let id = 1;
        const usedIds = new Set(placedBases.map(b => b.id));
        while (usedIds.has(id)) {
            id++;
        }
        return id;
    }

    function processMapClick(e) {
        const pos = getMousePos(e);

        const worldX = (pos.x - camera.x) / camera.scale;
        const worldY = (pos.y - camera.y) / camera.scale;

        const gridX = Math.floor(worldX / PIXELS_PER_TILE / 2) * 2;
        const gridY = Math.floor(worldY / PIXELS_PER_TILE / 2) * 2;

        const clickedBaseIndex = placedBases.findIndex(b => 
            gridX >= b.gridX && gridX < b.gridX + 2 &&
            gridY >= b.gridY && gridY < b.gridY + 2
        );

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

        placedBases.push({ 
            id: getNextAvailableId(), 
            gridX: gridX, 
            gridY: gridY, 
            playerName: '' 
        });
        
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

        if (checkCollision(presets.cityHall.coords, mapConfig.sizes.cityHall)) return false;
        if (checkCollision(presets.plazas.coords, mapConfig.sizes.plaza)) return false;
        if (checkCollision(presets.armories.coords, mapConfig.sizes.armory)) return false;
        if (currentMode === 'ultimate' && checkCollision(presets.ultimateArmories.coords, mapConfig.sizes.armory)) return false;

        return true;
    }

    // --- RENDERING ---
    function drawMap(useCamera = true) {
        ctx.setTransform(1, 0, 0, 1, 0, 0);
        ctx.clearRect(0, 0, canvas.width, canvas.height);

        if (useCamera) {
            ctx.translate(camera.x, camera.y);
            ctx.scale(camera.scale, camera.scale);
        }

        ctx.fillStyle = '#222';
        ctx.fillRect(0, 0, CANVAS_SIZE, CANVAS_SIZE);

        drawGridLines();

        ctx.fillStyle = 'rgba(255, 0, 0, 0.1)';
        mapConfig.outOfBoundsAreas.forEach(area => {
            ctx.fillRect(area.x * PIXELS_PER_TILE, area.y * PIXELS_PER_TILE, area.width * PIXELS_PER_TILE, area.height * PIXELS_PER_TILE);
        });

        // Pass the imageKey instead of color
        drawPresetGroup(presets.cityHall.coords, mapConfig.sizes.cityHall, presets.cityHall.imageKey);
        drawPresetGroup(presets.plazas.coords, mapConfig.sizes.plaza, presets.plazas.imageKey);
        drawPresetGroup(presets.armories.coords, mapConfig.sizes.armory, presets.armories.imageKey);
        if (currentMode === 'ultimate') drawPresetGroup(presets.ultimateArmories.coords, mapConfig.sizes.armory, presets.ultimateArmories.imageKey);

        placedBases.forEach(base => {
            const pixelX = base.gridX * PIXELS_PER_TILE;
            const pixelY = base.gridY * PIXELS_PER_TILE;
            const pixelSize = 2 * PIXELS_PER_TILE; 

            ctx.fillStyle = '#e74c3c';
            ctx.fillRect(pixelX, pixelY, pixelSize, pixelSize);
            
            ctx.fillStyle = '#ffffff';
            ctx.font = 'bold 6px Arial';
            ctx.textAlign = 'center';
            ctx.textBaseline = 'middle';
            ctx.fillText(base.id, pixelX + (pixelSize/2), pixelY + (pixelSize/2));
        });

        ctx.setTransform(1, 0, 0, 1, 0, 0);
    }

    function drawGridLines() {
        ctx.strokeStyle = '#333';
        ctx.lineWidth = 1 / camera.scale; 
        
        ctx.beginPath();
        for (let i = 0; i <= GRID_SIZE; i += 2) {
            const pos = i * PIXELS_PER_TILE;
            ctx.moveTo(pos, 0);
            ctx.lineTo(pos, CANVAS_SIZE);
            ctx.moveTo(0, pos);
            ctx.lineTo(CANVAS_SIZE, pos);
        }
        ctx.stroke();
    }

    // Now expects an imageKey to fetch from our preloaded asset dictionary
    function drawPresetGroup(coords, size, imageKey) {
        const img = loadedImages[imageKey];
        const pixelSize = size * PIXELS_PER_TILE;
        
        coords.forEach(([cx, cy]) => {
            const x = (cx * PIXELS_PER_TILE) - (pixelSize / 2);
            const y = (cy * PIXELS_PER_TILE) - (pixelSize / 2);
            
            if (img) {
                // If image successfully loaded, draw it
                ctx.drawImage(img, x, y, pixelSize, pixelSize);
            } else {
                // Fallback to a grey block if the path was wrong
                ctx.fillStyle = '#555';
                ctx.fillRect(x, y, pixelSize, pixelSize);
            }
        });
    }

    // --- UI & EXPORT ---
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
        drawMap(false); 

        const exportCanvas = document.createElement('canvas');
        const legendWidth = 350;
        exportCanvas.width = canvas.width + legendWidth;
        exportCanvas.height = Math.max(canvas.height, 800); 
        const eCtx = exportCanvas.getContext('2d');

        eCtx.fillStyle = '#1a1a1a';
        eCtx.fillRect(0, 0, exportCanvas.width, exportCanvas.height);
        
        eCtx.drawImage(canvas, 0, 0);

        eCtx.fillStyle = '#00d2ff';
        eCtx.font = 'bold 32px Arial';
        eCtx.fillText('Player Bases', canvas.width + 20, 50);

        eCtx.fillStyle = '#ffffff';
        eCtx.font = '20px Arial';
        let yOffset = 100;
        placedBases.forEach(base => {
            const name = base.playerName.trim() === '' ? `Player ${base.id}` : base.playerName;
            eCtx.fillText(`[${base.id}] - ${name}`, canvas.width + 20, yOffset);
            yOffset += 40;
        });

        drawMap(true);

        const link = document.createElement('a');
        link.download = `dcdl-map-${currentMode}.png`;
        link.href = exportCanvas.toDataURL("image/png");
        link.click();
    }
});