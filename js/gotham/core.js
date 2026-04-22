document.addEventListener("DOMContentLoaded", () => {
    const canvas = document.getElementById('map-canvas');
    const ctx = canvas.getContext('2d');
    const legendContainer = document.getElementById('player-legend');
    
    // Grid & Resolution limits
    const GRID_SIZE = 256;
    const CANVAS_SIZE = 1024;
    const PIXELS_PER_TILE = CANVAS_SIZE / GRID_SIZE; // 4 pixels

    // Simulated Firestore Configuration Data
    const mapConfig = {
        sizes: {
            cityHall: 12,
            plaza: 6,
            armory: 4
        },
        outOfBoundsAreas: [
            // Example: { x: 0, y: 0, width: 256, height: 10 }
        ]
    };

    // Application State
    let currentMode = 'gotham';
    let placedBases = [];

    // Camera (Pan/Zoom) State
    let camera = { x: 0, y: 0, scale: 1 };
    let isDragging = false;
    let hasDragged = false;
    let dragStart = { x: 0, y: 0 };

    // Building Presets Data
    const presets = {
        cityHall: { coords: [[128, 128]], color: '#f1c40f' },
        plazas: { coords: [[68, 128], [98, 98], [128, 68], [158, 98], [188, 128], [158, 158], [128, 188], [98, 158]], color: '#3498db' },
        armories: { coords: [[100, 122], [122, 98], [135, 156], [157, 135]], color: '#9b59b6' },
        ultimateArmories: { coords: [[108, 147], [147, 108]], color: '#8e44ad' }
    };

    init();

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

    // --- PAN AND ZOOM LOGIC ---
    function handleZoom(e) {
        e.preventDefault();
        const rect = canvas.getBoundingClientRect();
        const mouseX = e.clientX - rect.left;
        const mouseY = e.clientY - rect.top;

        const zoomFactor = e.deltaY < 0 ? 1.1 : 0.9;
        
        const worldX = (mouseX - camera.x) / camera.scale;
        const worldY = (mouseY - camera.y) / camera.scale;

        camera.scale = Math.max(0.5, Math.min(camera.scale * zoomFactor, 10));

        camera.x = mouseX - worldX * camera.scale;
        camera.y = mouseY - worldY * camera.scale;

        drawMap();
    }

    function handlePointerDown(e) {
        if (e.target !== canvas) return;
        isDragging = true;
        hasDragged = false;
        dragStart = { x: e.clientX - camera.x, y: e.clientY - camera.y };
    }

    function handlePointerMove(e) {
        if (!isDragging) return;
        
        const newCameraX = e.clientX - dragStart.x;
        const newCameraY = e.clientY - dragStart.y;
        
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
        // Keep incrementing until we find a number not currently in use
        while (usedIds.has(id)) {
            id++;
        }
        return id;
    }

    function processMapClick(e) {
        const rect = canvas.getBoundingClientRect();
        const clickX = e.clientX - rect.left;
        const clickY = e.clientY - rect.top;

        const worldX = (clickX - camera.x) / camera.scale;
        const worldY = (clickY - camera.y) / camera.scale;

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
            setTimeout(() => canvas.style.border = "none", 300);
            return;
        }

        // Add new base using the lowest available gap ID
        placedBases.push({ 
            id: getNextAvailableId(), 
            gridX: gridX, 
            gridY: gridY, 
            playerName: '' 
        });
        
        // Sort the array so the legend stays in numerical order (1, 2, 3...)
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

        drawPresetGroup(presets.cityHall.coords, mapConfig.sizes.cityHall, presets.cityHall.color);
        drawPresetGroup(presets.plazas.coords, mapConfig.sizes.plaza, presets.plazas.color);
        drawPresetGroup(presets.armories.coords, mapConfig.sizes.armory, presets.armories.color);
        if (currentMode === 'ultimate') drawPresetGroup(presets.ultimateArmories.coords, mapConfig.sizes.armory, presets.ultimateArmories.color);

        placedBases.forEach(base => {
            const pixelX = base.gridX * PIXELS_PER_TILE;
            const pixelY = base.gridY * PIXELS_PER_TILE;
            const pixelSize = 2 * PIXELS_PER_TILE; 

            ctx.fillStyle = '#e74c3c';
            ctx.fillRect(pixelX, pixelY, pixelSize, pixelSize);
            
            // Reduced Font Size so it fits neatly into the 8x8 pixel bounding box
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

    function drawPresetGroup(coords, size, color) {
        ctx.fillStyle = color;
        const pixelSize = size * PIXELS_PER_TILE;
        coords.forEach(([cx, cy]) => {
            const x = (cx * PIXELS_PER_TILE) - (pixelSize / 2);
            const y = (cy * PIXELS_PER_TILE) - (pixelSize / 2);
            ctx.fillRect(x, y, pixelSize, pixelSize);
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