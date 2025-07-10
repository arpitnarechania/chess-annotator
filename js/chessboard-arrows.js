/*

A library that extends any chessboard library to allow users to draw arrows and circles.
Right-click to draw arrows and circles, left-click to clear the drawings.

Author: Brendon McBain
Date: 07/04/2020

Modified by: Arpit Narechania
Date: 07/06/2025

*/

var ChessboardArrows = function (container, primaryCanvas, drawCanvas, resFactor, apiColour, userColour, onArrowDrawn, validateMove) {

    const NUM_SQUARES = 8;
    var resFactor, apiColour, userColour, drawContext, primaryContext, initialPoint, mouseDown
    var self = this;  // Store reference to this instance

    // Arrays to store drawn elements
    var apiDrawnElements = [];
    var userDrawnElements = [];

    // Formatting settings
    var arrowSettings = {
        color: '#ffeb3b',
        width: 8,
        headSize: 15,
        opacity: 100
    };
    
    var circleSettings = {
        color: '#ffeb3b',
        thickness: 3,
        opacity: 100
    };

    resFactor = resFactor;
    apiColour = apiColour;
    userColour = userColour;

    // drawing canvas
    drawContext = changeResolution(drawCanvas, resFactor);
    setContextStyle(drawContext, userColour);

    // primary canvas
    primaryContext = changeResolution(primaryCanvas, resFactor);
    setContextStyle(primaryContext, userColour);

    // setup mouse event callbacks
    const mouseDownHandler = function (event) { onMouseDown(event); };
    const mouseUpHandler = function (event) { onMouseUp(event); };
    const mouseMoveHandler = function (event) { onMouseMove(event); };
    const contextMenuHandler = function (e) { e.preventDefault(); };
    
    container.addEventListener("mousedown", mouseDownHandler);
    container.addEventListener("mouseup", mouseUpHandler);
    container.addEventListener("mousemove", mouseMoveHandler);
    container.addEventListener('contextmenu', contextMenuHandler, false);
    
    // Store event handlers for later removal
    this.mouseDownHandler = mouseDownHandler;
    this.mouseUpHandler = mouseUpHandler;
    this.mouseMoveHandler = mouseMoveHandler;
    this.contextMenuHandler = contextMenuHandler;

    // initialise vars
    initialPoint = { x: null, y: null };
    finalPoint = { x: null, y: null };
    arrowWidth = 15;
    mouseDown = false;

    // Store contexts as class properties
    this.primaryContext = primaryContext;
    this.drawContext = drawContext;
    this.primaryCanvas = primaryCanvas;
    this.drawCanvas = drawCanvas;

    // Element types
    const ELEMENT_TYPES = {
        ARROW: 'arrow',
        CIRCLE: 'circle'
    };

    // Helper function to create element object
    function createElementObject(type, fromSquare, toSquare, x, y, radius) {
        return {
            type: type,
            fromSquare: fromSquare,
            toSquare: toSquare,
            x: x,
            y: y,
            radius: radius,
            // Instance-based styling
            arrowSettings: type === ELEMENT_TYPES.ARROW ? {...arrowSettings} : null,
            circleSettings: type === ELEMENT_TYPES.CIRCLE ? {...circleSettings} : null
        };
    }

    // Helper function to get square coordinates
    function getSquareCoordinates(square) {
        const file = square.charCodeAt(0) - 'a'.charCodeAt(0);
        const rank = 8 - parseInt(square[1]);
        const squareSize = primaryCanvas.width / (resFactor * NUM_SQUARES);
        return {
            x: (file + 0.5) * squareSize,
            y: (rank + 0.5) * squareSize
        };
    }

    // Helper function to get square from coordinates
    function getSquareFromCoordinates(x, y) {
        const squareSize = primaryCanvas.width / (resFactor * NUM_SQUARES);
        const file = Math.floor(x / squareSize);
        const rank = Math.floor(y / squareSize);
        return String.fromCharCode('a'.charCodeAt(0) + file) + (8 - rank);
    }

    // source: https://stackoverflow.com/questions/808826/draw-arrow-on-canvas-tag
    function drawArrow(context, fromx, fromy, tox, toy, r) {
        var x_center = tox;
        var y_center = toy;
        var angle, x, y;

        context.beginPath();

        angle = Math.atan2(toy - fromy, tox - fromx)
        x = r * Math.cos(angle) + x_center;
        y = r * Math.sin(angle) + y_center;

        context.moveTo(x, y);

        angle += (1 / 3) * (2 * Math.PI)
        x = r * Math.cos(angle) + x_center;
        y = r * Math.sin(angle) + y_center;

        context.lineTo(x, y);

        angle += (1 / 3) * (2 * Math.PI)
        x = r * Math.cos(angle) + x_center;
        y = r * Math.sin(angle) + y_center;

        context.lineTo(x, y);
        context.closePath();
        context.fill();
    }

    function getMousePos(canvas, evt) {
        var rect = canvas.getBoundingClientRect();
        return {
            x: Q(evt.clientX - rect.left),
            y: Q(evt.clientY - rect.top)
        };
    }

    function setContextStyle(context, color, opacity = 1) {
        context.strokeStyle = context.fillStyle = color;
        context.globalAlpha = opacity;
        context.lineJoin = 'butt';
    }

    function onMouseDown(event) {
        if (event.which == 1) { // left click
            mouseDown = true;
            initialPoint = finalPoint = getMousePos(drawCanvas, event);
            const circleRadius = primaryCanvas.width / (resFactor * NUM_SQUARES * 2) - 1;
            drawCircle(drawContext, initialPoint.x, initialPoint.y, circleRadius);
        }
    }

    function onMouseUp(event) {
        if (event.which == 1) { // left click
            mouseDown = false;
            const fromSquare = getSquareFromCoordinates(initialPoint.x, initialPoint.y);
            // if starting position == ending position, draw a circle
            if (initialPoint.x == finalPoint.x && initialPoint.y == finalPoint.y) {
                // TOGGLE LOGIC: check if a user-drawn circle exists for this square
                const existingIndex = userDrawnElements.findIndex(e => e.type === ELEMENT_TYPES.CIRCLE && e.fromSquare === fromSquare);
                if (existingIndex !== -1) {
                    // Remove the existing circle
                    userDrawnElements.splice(existingIndex, 1);
                    // Redraw all user elements
                    self.redrawUserElements();
                } else {
                    const circleRadius = primaryCanvas.width / (resFactor * NUM_SQUARES * 2) - 1;
                    const element = createElementObject(
                        ELEMENT_TYPES.CIRCLE,
                        fromSquare,
                        null,
                        initialPoint.x,
                        initialPoint.y,
                        circleRadius
                    );
                    userDrawnElements.push(element);
                    drawCircle(primaryContext, initialPoint.x, initialPoint.y, element.radius, element.circleSettings);
                }
            }
            // otherwise draw an arrow
            else {
                const toSquare = getSquareFromCoordinates(finalPoint.x, finalPoint.y);
                
                // Validate the move before drawing
                let isValidMove = true;
                if (validateMove && typeof validateMove === 'function') {
                    isValidMove = validateMove(fromSquare, toSquare);
                }
                
                if (isValidMove) {
                    const element = createElementObject(
                        ELEMENT_TYPES.ARROW,
                        fromSquare,
                        toSquare,
                        null,
                        null,
                        null
                    );
                    userDrawnElements.push(element);
                    drawArrowToCanvas(primaryContext, element.arrowSettings);
                    
                    // Call the callback if provided
                    if (onArrowDrawn && typeof onArrowDrawn === 'function') {
                        onArrowDrawn(fromSquare, toSquare, element.arrowSettings);
                    }
                }
                // If invalid move, don't draw anything and just clear the drawing canvas
            }
            drawContext.clearRect(0, 0, drawCanvas.width, drawCanvas.height);
        }
    }

    function onMouseMove(event) {
        finalPoint = getMousePos(drawCanvas, event);

        if (!mouseDown) return;
        if (initialPoint.x == finalPoint.x && initialPoint.y == finalPoint.y) return;

        drawContext.clearRect(0, 0, drawCanvas.width, drawCanvas.height);
        drawArrowToCanvas(drawContext);
    }

    function drawArrowToCanvas(context, settings = null) {
        const arrowStyle = settings || arrowSettings;
        
        // offset finalPoint so the arrow head hits the center of the square
        var xFactor, yFactor, offsetSize;
        if (finalPoint.x == initialPoint.x) {
            yFactor = Math.sign(finalPoint.y - initialPoint.y) * arrowStyle.headSize;
            xFactor = 0
        }
        else if (finalPoint.y == initialPoint.y) {
            xFactor = Math.sign(finalPoint.x - initialPoint.x) * arrowStyle.headSize;
            yFactor = 0;
        }
        else {
            // find delta x and delta y to achieve hypotenuse of arrowStyle.headSize
            slope_mag = Math.abs((finalPoint.y - initialPoint.y) / (finalPoint.x - initialPoint.x));
            xFactor = Math.sign(finalPoint.x - initialPoint.x) * arrowStyle.headSize / Math.sqrt(1 + Math.pow(slope_mag, 2));
            yFactor = Math.sign(finalPoint.y - initialPoint.y) * Math.abs(xFactor) * slope_mag;
        }

        // Set context style with current settings
        setContextStyle(context, arrowStyle.color, arrowStyle.opacity / 100);

        // draw line
        context.beginPath();
        context.lineCap = "round";
        context.lineWidth = arrowStyle.width;
        context.moveTo(initialPoint.x, initialPoint.y);
        context.lineTo(finalPoint.x - xFactor, finalPoint.y - yFactor);
        context.stroke();

        // draw arrow head
        drawArrow(context, initialPoint.x, initialPoint.y, finalPoint.x - xFactor, finalPoint.y - yFactor, arrowStyle.headSize);
    }

    function Q(x, d) {  // mid-tread quantiser
        d = primaryCanvas.width / (resFactor * NUM_SQUARES);
        return d * (Math.floor(x / d) + 0.5);
    }

    function drawCircle(context, x, y, r, settings = null) {
        const circleStyle = settings || circleSettings;
        
        // Set context style with current settings
        setContextStyle(context, circleStyle.color, circleStyle.opacity / 100);
        
        context.beginPath();
        context.lineWidth = circleStyle.thickness;
        context.arc(x, y, r, 0, 2 * Math.PI);
        context.stroke();
    }

    // source: https://stackoverflow.com/questions/14488849/higher-dpi-graphics-with-html5-canvas
    function changeResolution(canvas, scaleFactor) {
        // Store original dimensions if not already stored
        if (!canvas._originalWidth) {
            canvas._originalWidth = canvas.width;
            canvas._originalHeight = canvas.height;
        }
        
        // Set up CSS size using original dimensions
        canvas.style.width = canvas.style.width || canvas._originalWidth + 'px';
        canvas.style.height = canvas.style.height || canvas._originalHeight + 'px';

        // Reset to original dimensions before scaling to prevent cumulative scaling
        canvas.width = Math.ceil(canvas._originalWidth * scaleFactor);
        canvas.height = Math.ceil(canvas._originalHeight * scaleFactor);
        var ctx = canvas.getContext('2d');
        ctx.scale(scaleFactor, scaleFactor);
        return ctx;
    }

    // Function to redraw all elements
    function redrawElements(elements, context, color) {
        elements.forEach(element => {
            if (element.type === ELEMENT_TYPES.ARROW) {
                const fromCoords = getSquareCoordinates(element.fromSquare);
                const toCoords = getSquareCoordinates(element.toSquare);
                initialPoint = fromCoords;
                finalPoint = toCoords;
                drawArrowToCanvas(context, element.arrowSettings);
            } else if (element.type === ELEMENT_TYPES.CIRCLE) {
                drawCircle(context, element.x, element.y, element.radius, element.circleSettings);
            }
        });
    }

    // Add methods to draw arrows and circles programmatically
    this.drawArrowFromTo = function (fromSquare, toSquare) {
        // Set API color for this drawing
        setContextStyle(primaryContext, apiColour);
        
        const fromCoords = getSquareCoordinates(fromSquare);
        const toCoords = getSquareCoordinates(toSquare);
        
        const element = createElementObject(
            ELEMENT_TYPES.ARROW,
            fromSquare,
            toSquare,
            null,
            null,
            null
        );
        apiDrawnElements.push(element);
        
        initialPoint = fromCoords;
        finalPoint = toCoords;
        drawArrowToCanvas(this.primaryContext);
        
        // Reset to user color for future user drawings
        setContextStyle(primaryContext, userColour);
    };

    this.drawCircleOn = function (square) {
        // Set API color for this drawing
        setContextStyle(primaryContext, apiColour);
        
        const coords = getSquareCoordinates(square);
        const squareSize = this.primaryCanvas.width / (resFactor * NUM_SQUARES);
        
        const element = createElementObject(
            ELEMENT_TYPES.CIRCLE,
            square,
            null,
            coords.x,
            coords.y,
            squareSize / 2 - 1
        );
        apiDrawnElements.push(element);
        
        drawCircle(this.primaryContext, coords.x, coords.y, element.radius);
        
        // Reset to user color for future user drawings
        setContextStyle(primaryContext, userColour);
    };

    this.clearAll = function () {
        // Clear both canvases
        this.drawContext.clearRect(0, 0, this.drawCanvas.width, this.drawCanvas.height);
        this.primaryContext.clearRect(0, 0, this.primaryCanvas.width, this.primaryCanvas.height);
        // Clear stored elements
        apiDrawnElements = [];
        userDrawnElements = [];
    };
    
    this.destroy = function () {
        // Remove event listeners
        container.removeEventListener("mousedown", this.mouseDownHandler);
        container.removeEventListener("mouseup", this.mouseUpHandler);
        container.removeEventListener("mousemove", this.mouseMoveHandler);
        container.removeEventListener("contextmenu", this.contextMenuHandler);
        
        // Clear canvases
        this.clearAll();
    };
    
    this.clearUserDrawn = function () {
        // Clear canvases
        this.drawContext.clearRect(0, 0, this.drawCanvas.width, this.drawCanvas.height);
        this.primaryContext.clearRect(0, 0, this.primaryCanvas.width, this.primaryCanvas.height);
        // Clear user elements array
        userDrawnElements = [];
        // Redraw API elements
        redrawElements(apiDrawnElements, this.primaryContext, apiColour);
        // Reset to user color for future user drawings
        setContextStyle(this.primaryContext, userColour);
    };
    
    this.clearAPIDrawn = function () {
        // Clear canvases
        this.drawContext.clearRect(0, 0, this.drawCanvas.width, this.drawCanvas.height);
        this.primaryContext.clearRect(0, 0, this.primaryCanvas.width, this.primaryCanvas.height);
        // Clear API elements array
        apiDrawnElements = [];
        // Redraw user elements
        redrawElements(userDrawnElements, this.primaryContext, userColour);
    };

    this.drawPiecePath = function (positions, color) {
        // Set color for this drawing
        setContextStyle(primaryContext, color);
        
        // Draw circle at start position
        const startCoords = getSquareCoordinates(positions[0]);
        const squareSize = this.primaryCanvas.width / (resFactor * NUM_SQUARES);
        drawCircle(this.primaryContext, startCoords.x, startCoords.y, squareSize / 2 - 1);
        
        // Draw circle at end position
        const endCoords = getSquareCoordinates(positions[positions.length - 1]);
        drawCircle(this.primaryContext, endCoords.x, endCoords.y, squareSize / 2 - 1);
        
        // Draw arrows connecting all positions
        for (let i = 0; i < positions.length - 1; i++) {
            const fromCoords = getSquareCoordinates(positions[i]);
            const toCoords = getSquareCoordinates(positions[i + 1]);
            initialPoint = fromCoords;
            finalPoint = toCoords;
            drawArrowToCanvas(this.primaryContext);
        }
        
        // Reset to user color for future user drawings
        setContextStyle(primaryContext, userColour);
    };

    // Methods to update formatting settings
    this.updateArrowSettings = function(newSettings) {
        Object.assign(arrowSettings, newSettings);
        this.redrawUserElements();
    };

    this.updateCircleSettings = function(newSettings) {
        Object.assign(circleSettings, newSettings);
        this.redrawUserElements();
    };

    this.redrawUserElements = function() {
        // Clear canvases
        this.drawContext.clearRect(0, 0, this.drawCanvas.width, this.drawCanvas.height);
        this.primaryContext.clearRect(0, 0, this.primaryCanvas.width, this.primaryCanvas.height);
        
        // Redraw API elements
        redrawElements(apiDrawnElements, this.primaryContext, apiColour);
        
        // Redraw user elements with new settings
        redrawElements(userDrawnElements, this.primaryContext, userColour);
    };

    this.getArrowSettings = function() {
        return {...arrowSettings};
    };

    this.getCircleSettings = function() {
        return {...circleSettings};
    };
}