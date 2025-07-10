/**
 * Chess Annotator
 * Author: Arpit Narechania
 * Date: 07/04/2025
 */

// Global variables
let annotationBoard;
let setupBoard;
let overlay;
let chess;
let currentGame = null;
let currentMoveIndex = 0;
let selectedSquare = null;
let legalMoves = [];
let pendingPromotion = null;
let moveBoard;
let annotationLine = [];
let annotationLineIndex = 0;
let pendingAnnotationPromotion = null;
let arrowsByMoveIndex = {}; // { [moveIndex]: [ { from, to, color } ] }
let basePosition = 'start'; // Track the original position when loaded

/**
 * Main application initialization
 */
document.addEventListener('DOMContentLoaded', () => {
    initializeAnnotationBoard();
    initializeMoveBoard();
    initializeEventListeners();
    initializeDrawingToolbar();
    loadSampleGames();
    initializeSetupMode();
    
    // Initialize dual-board mode
    // Annotation board: arrows enabled, piece movement disabled
    const annotationBoardDiv = document.querySelector('.annotation-board');
    const annotationBoardPrimaryCanvas = document.querySelector('.annotation-board-primary-canvas');
    const annotationBoardDrawingCanvas = document.querySelector('.annotation-board-drawing-canvas');
    
    annotationBoardDiv.style.pointerEvents = 'none';
    annotationBoardPrimaryCanvas.style.pointerEvents = 'auto';
    annotationBoardDrawingCanvas.style.pointerEvents = 'auto';
    
    // Move board: arrows disabled, piece movement enabled
    const moveBoardDiv = document.querySelector('.move-board');
    moveBoardDiv.style.pointerEvents = 'auto';
    
    // Initialize annotation navigation buttons
    updateAnnotationNavigationButtons();
    renderAnnotationMoveList();
    
    // Initialize manual move input
    initializeManualMoveInput();
});

/**
 * Initialize the chess board and overlay
 */
function initializeAnnotationBoard() {
    // Get the board container and dimensions
    const annotationBoardContainer = document.querySelector('.annotation-board-container');
    const annotationBoardWidth = $(annotationBoardContainer).width();
    const annotationBoardHeight = $(annotationBoardContainer).height();

    // Get the board element
    const annotationBoardDiv = document.querySelector('.annotation-board');
    annotationBoardDiv.id = 'annotation-board';

    // Get the board's primary canvas
    const offset = 5; // Not sure why but in spite of giving the canvases and the board same width and height, there is a need to subtract this offset to make everything align perfectly.
    const annotationBoardPrimaryCanvas = document.querySelector('.annotation-board-primary-canvas');
    annotationBoardPrimaryCanvas.id = 'annotation-board-primary-canvas';
    annotationBoardPrimaryCanvas.width = annotationBoardWidth - offset;
    annotationBoardPrimaryCanvas.height = annotationBoardHeight - offset;

    // Get the board's drawing canvas
    const annotationBoardDrawingCanvas = document.querySelector('.annotation-board-drawing-canvas');
    annotationBoardDrawingCanvas.id = 'annotation-board-drawing-canvas';
    annotationBoardDrawingCanvas.width = annotationBoardWidth - offset;
    annotationBoardDrawingCanvas.height = annotationBoardHeight - offset;

    // Initialize chess.js
    chess = new Chess();

    // Create chessboard instance
    annotationBoard = Chessboard(annotationBoardDiv, {
        pieceTheme: 'images/chesspieces/wikipedia/{piece}.png',
        position: 'start',
        draggable: false, // Disable piece movement on annotation board
        sparePieces: false,
        showNotation: true
        // No event handlers - this board is for annotations only
    });
    
    // Update turn indicator
    updateTurnIndicator();
    
    // Ensure annotation board container has proper pointer events
    annotationBoardContainer.style.pointerEvents = 'auto';
    
    // Initialize overlay for annotation board
    overlay = new ChessboardArrows(
        annotationBoardContainer, 
        annotationBoardPrimaryCanvas, 
        annotationBoardDrawingCanvas,
        3, // RES_FACTOR
        '#007bff', // API_COLOUR
        '#fff200', // USER_COLOUR
        function(fromSquare, toSquare, arrowSettings) {
            // This callback is called whenever a user draws an arrow
            addAnnotationArrow(fromSquare, toSquare, arrowSettings.color);
        },
        function(fromSquare, toSquare) {
            // Validation function - return true if move is legal
            // Get the current position (either from annotation line or current chess instance)
            let basePosition = annotationLine.length === 0 ? chess.fen() : annotationLine[annotationLine.length - 1].fen;
            let tempChess = new Chess();
            tempChess.load(basePosition);
            
            // Check if the move is legal
            const legalMoves = tempChess.moves({ square: fromSquare, verbose: true });
            return legalMoves.some(move => move.to === toSquare);
        }
    );
    
    // Initialize overlay with current toolbar settings
    // These will be called after the toolbar is initialized
}



/**
 * Move Board Event Handlers
 */
function onMoveBoardDragStart(source, piece, position, orientation) {
    // Check if it's the correct player's turn
    const pieceColor = piece.charAt(0); // 'w' or 'b'
    const currentTurn = chess.turn(); // 'w' or 'b'
    
    if (pieceColor !== currentTurn) {
        return false; // Not this player's turn
    }
    
    // Store the selected square and calculate legal moves
    selectedSquare = source;
    legalMoves = chess.moves({ square: source, verbose: true });

    // Highlight the selected piece on move board
    removeAllMoveBoardHighlights();
    addMoveBoardHighlight(source, 'selected-piece');
    
    // Highlight legal moves on move board
    legalMoves.forEach(move => {
        const targetSquare = move.to;
        const isCapture = move.captured;
        addMoveBoardHighlight(targetSquare, isCapture ? 'legal-move-capture' : 'legal-move');
    });
    
    return true;
}

function onMoveBoardDrop(source, target, piece, newPos, oldPos, orientation) {
    // Check if this is a pawn promotion
    const isPawnPromotion = piece.charAt(1) === 'P' && 
                           ((piece.charAt(0) === 'w' && target.charAt(1) === '8') || 
                            (piece.charAt(0) === 'b' && target.charAt(1) === '1'));
    
    if (isPawnPromotion) {
        // Check if this is a legal promotion move
        const legalMoves = chess.moves({ square: source, verbose: true });
        const isLegalPromotion = legalMoves.some(move => move.to === target && move.promotion);
        
        if (!isLegalPromotion) {
            return 'snapback'; // Illegal promotion move
        }
        
        // Store pending promotion details
        pendingPromotion = {
            source: source,
            target: target,
            piece: piece
        };
        
        // Show promotion modal
        showPromotionModal(piece.charAt(0));
        
        // Don't complete the move yet - wait for user selection
        return 'snapback';
    }
    
    // Regular move (not promotion)
    const move = chess.move({
        from: source,
        to: target
    });
    
    if (move === null) {
        return 'snapback'; // Illegal move
    }
    
    // Clear highlights
    removeAllMoveBoardHighlights();
    selectedSquare = null;
    legalMoves = [];
    
    // Update only the move board
    moveBoard.position(chess.fen());
    updateTurnIndicator();
    
    // Draw arrow on annotation board (on the original position)
    const arrowColor = document.getElementById('arrowColor').value;
    const arrowWidth = parseInt(document.getElementById('arrowSize').value);
    const arrowOpacity = parseInt(document.getElementById('arrowOpacity').value) / 100;
    // If you have a head type selector, get it here, else default
    const arrowHeadType = window.arrowHeadType || 'default';
    if (overlay) {
        overlay.drawArrowFromTo(source, target, arrowColor); // Use current arrow color
    }
    
    // Update annotation line for tracking
    annotationLine.push({ from: source, to: target, color: arrowColor, width: arrowWidth, opacity: arrowOpacity, fen: chess.fen() });
    annotationLineIndex = annotationLine.length;
    if (!arrowsByMoveIndex[currentMoveIndex]) arrowsByMoveIndex[currentMoveIndex] = [];
    arrowsByMoveIndex[currentMoveIndex].push({ from: source, to: target, color: arrowColor, width: arrowWidth, opacity: arrowOpacity });
    
    // Update move list
    renderAnnotationMoveList();
    
    return 'drop';
}

function onMoveBoardMouseoverSquare(square, piece, position, orientation) {
    // If we're not dragging and there's a piece on this square
    if (piece) {
        const pieceColor = piece.charAt(0);
        const currentTurn = chess.turn();
        // Only show moves for the current player's pieces
        if (pieceColor === currentTurn) {
            removeAllMoveBoardHighlights(); // Always clear previous highlights
            const moves = chess.moves({ square: square, verbose: true });
            // Highlight the piece being hovered
            addMoveBoardHighlight(square, 'selected-piece');
            // Highlight legal moves
            moves.forEach(move => {
                const targetSquare = move.to;
                const isCapture = move.captured;
                addMoveBoardHighlight(targetSquare, isCapture ? 'legal-move-capture' : 'legal-move');
            });
        }
    }
}

function onMoveBoardMouseoutSquare(square, piece, position, orientation) {
    // Always clear all highlights when mouse leaves a square
    removeAllMoveBoardHighlights();
}

/**
 * Move Board Highlight Management Functions
 */
function addMoveBoardHighlight(square, className) {
    const squareElement = document.querySelector(`#move-board [data-square="${square}"]`);
    if (squareElement) {
        squareElement.classList.add(className);
    }
}

function removeAllMoveBoardHighlights() {
    const squares = document.querySelectorAll('#move-board .square-55d63');
    squares.forEach(square => {
        square.classList.remove('legal-move', 'legal-move-capture', 'selected-piece');
    });
}

/**
 * Highlight management functions
 */
function addHighlight(square, className) {
    const squareElement = document.querySelector(`#annotation-board [data-square="${square}"]`);
    if (squareElement) {
        squareElement.classList.add(className);
    }
}

function removeAllHighlights() {
    const squares = document.querySelectorAll('#annotation-board .square-55d63');
    squares.forEach(square => {
        square.classList.remove('legal-move', 'legal-move-capture', 'selected-piece');
    });
}

/**
 * Initialize all event listeners
 */
function initializeEventListeners() {
    // Sample Games Events
    document.getElementById('sampleGameSelect').addEventListener('change', handleSampleGameSelect);

    // Upload PGN Events
    document.getElementById('pgnFileInput').addEventListener('change', handlePGNFileUpload);
    document.getElementById('uploadedGameSelect').addEventListener('change', handleUploadedGameSelect);

    // Game Navigation Events (Sample Games)
    document.getElementById('firstMoveBtn').addEventListener('click', () => navigateToMove(0, 'sample'));
    document.getElementById('prevMoveBtn').addEventListener('click', () => navigateToMove(currentMoveIndex - 1, 'sample'));
    document.getElementById('nextMoveBtn').addEventListener('click', () => navigateToMove(currentMoveIndex + 1, 'sample'));
    document.getElementById('lastMoveBtn').addEventListener('click', () => navigateToMove(-1, 'sample'));
    document.getElementById('moveCounter').addEventListener('change', () => goToSpecificMove('sample'));
    document.getElementById('moveCounter').addEventListener('keypress', (e) => {
        if (e.key === 'Enter') goToSpecificMove('sample');
    });

    // Game Navigation Events (Uploaded PGN)
    document.getElementById('uploadedFirstMoveBtn').addEventListener('click', () => navigateToMove(0, 'uploaded'));
    document.getElementById('uploadedPrevMoveBtn').addEventListener('click', () => navigateToMove(currentMoveIndex - 1, 'uploaded'));
    document.getElementById('uploadedNextMoveBtn').addEventListener('click', () => navigateToMove(currentMoveIndex + 1, 'uploaded'));
    document.getElementById('uploadedLastMoveBtn').addEventListener('click', () => navigateToMove(-1, 'uploaded'));
    document.getElementById('uploadedMoveCounter').addEventListener('change', () => goToSpecificMove('uploaded'));
    document.getElementById('uploadedMoveCounter').addEventListener('keypress', (e) => {
        if (e.key === 'Enter') goToSpecificMove('uploaded');
    });

    // FEN Panel Events
    document.getElementById('loadFenBtn').addEventListener('click', loadFENPosition);
    document.getElementById('fenInput').addEventListener('keypress', (e) => {
        if (e.key === 'Enter') loadFENPosition();
    });
    
    // Initialize annotation toolbar (always visible)
    const annotationToolbar = document.getElementById('annotationToolbar');
    if (annotationToolbar) {
        annotationToolbar.style.display = 'block';
        // Bind voice annotate button event
        const voiceBtn = document.getElementById('voiceAnnotateBtn');
        if (voiceBtn) voiceBtn.addEventListener('click', startVoiceAnnotation);
        
        // Bind manual move input events
        const goMoveBtn = document.getElementById('goMoveBtn');
        const moveInputField = document.getElementById('moveInputField');
        
        if (goMoveBtn) goMoveBtn.addEventListener('click', executeManualMove);
        if (moveInputField) {
            moveInputField.addEventListener('keypress', function(e) {
                if (e.key === 'Enter') {
                    executeManualMove();
                }
            });
        }
    }
    
    // Initialize annotation line controls (always available)
    addAnnotationLineControls();
    
    // Clear Annotations Button Event
    document.getElementById('clearAnnotationsBtn').addEventListener('click', clearAllAnnotations);
    
    // Setup Tab Event
    document.getElementById('setup-tab').addEventListener('click', initializeSetupMode);
    
    // Tab switching events to isolate boards
    document.querySelectorAll('[data-bs-toggle="tab"]').forEach(tab => {
        tab.addEventListener('shown.bs.tab', function(event) {
            const targetId = event.target.getAttribute('data-bs-target');
            
            if (targetId === '#setup-panel') {
                // Setup tab active - disable annotation board interactions
                const annotationBoardContainer = document.querySelector('.annotation-board-container');
                if (annotationBoardContainer) {
                    annotationBoardContainer.style.pointerEvents = 'none';
                }
            } else {
                // Other tab active - re-enable annotation board interactions
                const annotationBoardContainer = document.querySelector('.annotation-board-container');
                if (annotationBoardContainer) {
                    annotationBoardContainer.style.pointerEvents = 'auto';
                }
            }
        });
    });
    
    // Setup Button Events
    document.getElementById('startPositionBtn').addEventListener('click', setStartPosition);
    document.getElementById('clearBoardBtn').addEventListener('click', clearBoard);
    document.getElementById('flipBoardBtn').addEventListener('click', flipBoard);
    document.getElementById('doneSetupBtn').addEventListener('click', loadSetupToAnalysis);
    
    // Setup Turn Radio Events
    document.querySelectorAll('input[name="setupTurn"]').forEach(radio => {
        radio.addEventListener('change', function(event) {
            // No need to update labels since they're static now
        });
    });
    

    
    // Promotion Modal Events
    initializePromotionModal();

    // Annotation Navigation Events
    document.getElementById('annotationFirstBtn').addEventListener('click', () => navigateAnnotationLine('start'));
    document.getElementById('annotationPrevBtn').addEventListener('click', () => navigateAnnotationLine('prev'));
    document.getElementById('annotationNextBtn').addEventListener('click', () => navigateAnnotationLine('next'));
    document.getElementById('annotationLastBtn').addEventListener('click', () => navigateAnnotationLine('end'));
}




function initializeSetupMode() {
    if (!setupBoard) {
        const setupBoardDiv = document.querySelector('.setup-board');
        setupBoardDiv.id = 'setup-board';

        // Get current position from annotation board
        const currentPosition = annotationBoard.position();

        setupBoard = Chessboard(setupBoardDiv, {
            pieceTheme: 'images/chesspieces/wikipedia/{piece}.png',
            position: currentPosition,
            draggable: true,
            sparePieces: true,
            showNotation: true,
            dropOffBoard: 'trash'
            // No onDrop, onDragStart, onMouseoverSquare, or onMouseoutSquare - completely free setup
        });
    }
    
    // Ensure setup board is visible and annotation board is not interfering
    const setupBoardContainer = document.querySelector('.setup-board-container');
    if (setupBoardContainer) {
        setupBoardContainer.style.pointerEvents = 'auto';
    }
}

function setStartPosition() {
    if (setupBoard) {
        setupBoard.position('start');
        showMessage('Setup board set to starting position', 'success');
    }
}

function clearBoard() {
    if (setupBoard) {
        setupBoard.position({});
        showMessage('Setup board cleared', 'success');
    }
}

function flipBoard() {
    if (setupBoard) {
        setupBoard.flip();
        showMessage('Setup board flipped', 'success');
    }
}

function loadSetupToAnalysis() {
    clearAllAnnotations(); // Clear annotations before loading setup position
    if (!setupBoard) {
        showMessage('Setup board not available', 'error');
        return;
    }
    
    // Get the current position from setup board
    const setupPosition = setupBoard.position();
    
    // Get the orientation from setup board and apply it to annotation board
    const setupOrientation = setupBoard.orientation();
    if (annotationBoard.orientation() !== setupOrientation) {
        annotationBoard.flip();
    }
    
    // Get the selected turn from the radio buttons
    const selectedTurnRadio = document.querySelector('input[name="setupTurn"]:checked');
    const selectedTurn = selectedTurnRadio.value === 'black' ? 'b' : 'w';
    
    // Create FEN with the selected turn
    const fenWithTurn = Chessboard.objToFen(setupPosition) + ' ' + selectedTurn + ' KQkq - 0 1';
    
    try {
        // Validate the complete FEN (position + turn)
        const tempChess = new Chess(fenWithTurn);
        
        // Additional validation checks
        const position = tempChess.board();
        
        // Check for missing kings
        let whiteKingFound = false;
        let blackKingFound = false;
        let whiteKingPos = null;
        let blackKingPos = null;
        
        for (let rank = 0; rank < 8; rank++) {
            for (let file = 0; file < 8; file++) {
                const piece = position[rank][file];
                if (piece && piece.type === 'k') {
                    if (piece.color === 'w') {
                        whiteKingFound = true;
                        whiteKingPos = { rank, file };
                    }
                    if (piece.color === 'b') {
                        blackKingFound = true;
                        blackKingPos = { rank, file };
                    }
                }
            }
        }
        
        if (!whiteKingFound) {
            throw new Error('White king is missing');
        }
        if (!blackKingFound) {
            throw new Error('Black king is missing');
        }
        
        // Check if kings are adjacent to each other
        if (whiteKingPos && blackKingPos) {
            const rankDiff = Math.abs(whiteKingPos.rank - blackKingPos.rank);
            const fileDiff = Math.abs(whiteKingPos.file - blackKingPos.file);
            if (rankDiff <= 1 && fileDiff <= 1) {
                throw new Error('Kings cannot be adjacent to each other');
            }
        }
        
        // Check for pawns on end ranks
        for (let file = 0; file < 8; file++) {
            if (position[0][file] && position[0][file].type === 'p') {
                throw new Error('Pawn cannot be on the 8th rank');
            }
            if (position[7][file] && position[7][file].type === 'p') {
                throw new Error('Pawn cannot be on the 1st rank');
            }
        }
        
        // Check for too many pieces of each type
        const pieceCounts = { w: {}, b: {} };
        for (let rank = 0; rank < 8; rank++) {
            for (let file = 0; file < 8; file++) {
                const piece = position[rank][file];
                if (piece) {
                    const color = piece.color;
                    const type = piece.type;
                    pieceCounts[color][type] = (pieceCounts[color][type] || 0) + 1;
                }
            }
        }
        
        // Check piece limits
        if (pieceCounts.w.k > 1) throw new Error('White cannot have more than one king');
        if (pieceCounts.b.k > 1) throw new Error('Black cannot have more than one king');
        if (pieceCounts.w.q > 9) throw new Error('White cannot have more than 9 queens');
        if (pieceCounts.b.q > 9) throw new Error('Black cannot have more than 9 queens');
        if (pieceCounts.w.r > 10) throw new Error('White cannot have more than 10 rooks');
        if (pieceCounts.b.r > 10) throw new Error('Black cannot have more than 10 rooks');
        if (pieceCounts.w.b > 10) throw new Error('White cannot have more than 10 bishops');
        if (pieceCounts.b.b > 10) throw new Error('Black cannot have more than 10 bishops');
        if (pieceCounts.w.n > 10) throw new Error('White cannot have more than 10 knights');
        if (pieceCounts.b.n > 10) throw new Error('Black cannot have more than 10 knights');
        if (pieceCounts.w.p > 8) throw new Error('White cannot have more than 8 pawns');
        if (pieceCounts.b.p > 8) throw new Error('Black cannot have more than 8 pawns');
        
        // Check if king is in check on the wrong turn
        if (tempChess.in_check()) {
            const currentTurn = tempChess.turn();
            const oppositeTurn = currentTurn === 'w' ? 'b' : 'w';
            
            // Create a temporary chess instance with opposite turn to check
            const tempChessOpposite = new Chess(fenWithTurn);
            tempChessOpposite.turn(oppositeTurn);
            
            if (tempChessOpposite.in_check()) {
                throw new Error('King cannot be in check on both turns');
            }
        }
        
        // If all validation passes, load it to both boards
        annotationBoard.position(setupPosition);
        moveBoard.position(setupPosition);
        
        // Update the chess instance
        chess = tempChess;
        basePosition = fenWithTurn; // Set base position
        updateTurnIndicator();
        
        // Clear any current game
        currentGame = null;
        currentMoveIndex = 0;
        hideAllGameNavigation();
        
        // Clear any move highlights
        removeAllMoveBoardHighlights();
        selectedSquare = null;
        legalMoves = [];
        
        // Update move board to match
        updateMoveBoard();
        
        showMessage('Setup position loaded to annotation board!', 'success');
        
    } catch (error) {
        showMessage(`Invalid position: ${error.message}`, 'error');
        console.error('Setup Validation Error:', error);
    }
}

/**
 * Sample Games Features
 */
function loadSampleGames() {
    // Load the sample games PGN file and populate the dropdown directly
    fetch('data/sample-games.pgn')
        .then(response => response.text())
        .then(content => {
            const games = parseSampleGames(content);
            populateSampleGameSelect(games);
        })
        .catch(error => {
            showMessage('Error loading sample games', 'error');
            console.error('Sample Games Error:', error);
        });
}

function parseSampleGames(pgnContent) {
    try {
        // Split PGN into individual games
        const games = pgnContent.split(/\n\n(?=\[)/).filter(game => game.trim());

        return games.map((game, index) => ({
            id: index,
            content: game,
            metadata: extractGameMetadata(game)
        }));
    } catch (error) {
        console.error('Parse Sample Games Error:', error);
        return [];
    }
}

function populateSampleGameSelect(games) {
    const sampleSelect = document.getElementById('sampleGameSelect');

    // Clear existing options
    sampleSelect.innerHTML = '<option value="">Choose a sample game...</option>';

    // Add game options
    games.forEach(game => {
        const option = document.createElement('option');
        option.value = game.id;

        // Create descriptive text
        let description = `Game ${game.id + 1}`;
        if (game.metadata.Event) description += ` - ${game.metadata.Event}`;
        if (game.metadata.White && game.metadata.Black) {
            description += ` (${game.metadata.White} vs ${game.metadata.Black})`;
        }
        if (game.metadata.Date) description += ` - ${game.metadata.Date}`;

        option.textContent = description;
        sampleSelect.appendChild(option);
    });

    // Store games globally for access
    window.sampleGames = games;
}

function handleSampleGameSelect(event) {
    const gameIndex = parseInt(event.target.value);
    if (isNaN(gameIndex)) return;

    const game = window.sampleGames[gameIndex];
    if (!game) return;

    loadSelectedGame(game, 'sample');
}

/**
 * Upload PGN Features
 */
function handlePGNFileUpload(event) {
    const file = event.target.files[0];
    if (!file) return;

    const reader = new FileReader();
    reader.onload = function (e) {
        const pgnContent = e.target.result;
        parsePGNContent(pgnContent, file.name, 'uploaded');
    };
    reader.readAsText(file);
}

function parsePGNContent(pgnContent, fileName, type) {
    try {
        // Split PGN into individual games
        const games = pgnContent.split(/\n\n(?=\[)/).filter(game => game.trim());

        if (games.length === 0) {
            showMessage('No valid games found in PGN file', 'error');
            return;
        }

        // Store games for selection
        window.pgnGames = games.map((game, index) => ({
            id: index,
            content: game,
            metadata: extractGameMetadata(game)
        }));

        // Populate game selection dropdown
        populateGameSelect(games.length, fileName);

        showMessage(`Loaded ${games.length} game(s) from ${fileName}`, 'success');

    } catch (error) {
        showMessage('Error parsing PGN file', 'error');
        console.error('PGN Parse Error:', error);
    }
}

function extractGameMetadata(pgnGame) {
    const metadata = {};
    const lines = pgnGame.split('\n');

    lines.forEach(line => {
        const match = line.match(/^\[(\w+)\s+"([^"]*)"\]/);
        if (match) {
            metadata[match[1]] = match[2];
        }
    });

    return metadata;
}

function populateGameSelect(gameCount, fileName) {
    const gameSelect = document.getElementById('uploadedGameSelect');

    // Clear existing options
    gameSelect.innerHTML = '<option value="">Choose a game...</option>';

    // Add game options
    for (let i = 0; i < gameCount; i++) {
        const game = window.pgnGames[i];
        const option = document.createElement('option');
        option.value = i;

        // Create descriptive text
        let description = `Game ${i + 1}`;
        if (game.metadata.Event) description += ` - ${game.metadata.Event}`;
        if (game.metadata.White && game.metadata.Black) {
            description += ` (${game.metadata.White} vs ${game.metadata.Black})`;
        }
        if (game.metadata.Date) description += ` - ${game.metadata.Date}`;

        option.textContent = description;
        gameSelect.appendChild(option);
    }

    // Show game selection
    const gameSelectionRow = document.getElementById('uploadedGameSelectionRow');
    gameSelectionRow.style.display = 'block';
}

function handleUploadedGameSelect(event) {
    const gameIndex = parseInt(event.target.value);
    if (isNaN(gameIndex)) return;

    const game = window.pgnGames[gameIndex];
    if (!game) return;

    loadSelectedGame(game, 'uploaded');
}

function loadSelectedGame(game, type) {
    clearAllAnnotations(); // Clear annotations before loading new game
    try {
        // Parse the game with chess.js
        const gameChess = new Chess();
        const result = gameChess.load_pgn(game.content);

        if (!result) {
            showMessage('Error loading game', 'error');
            return;
        }

        // Store current game data
        currentGame = {
            chess: gameChess,
            moves: gameChess.history({ verbose: true }),
            metadata: game.metadata,
            type: type
        };

        // Reset to start position
        currentMoveIndex = 0;
        chess = new Chess();
        basePosition = chess.fen(); // Set base position to actual FEN
        console.log('=== loadSelectedGame ===');
        console.log('Setting basePosition to:', basePosition);
        console.log('Chess instance FEN:', chess.fen());
        annotationBoard.position('start');
        moveBoard.position('start');
        updateTurnIndicator();
        // Also update setup board to match
        if (setupBoard) {
            setupBoard.position('start');
        }
        // Update move board to match
        updateMoveBoard();

        // Clear any move highlights
        removeAllMoveBoardHighlights();
        selectedSquare = null;
        legalMoves = [];
        
        // Clear any pending promotion
        if (pendingPromotion) {
            pendingPromotion = null;
            const modal = bootstrap.Modal.getInstance(document.getElementById('promotionModal'));
            if (modal) {
                modal.hide();
            }
        }
        
        // Show navigation controls
        showGameNavigation(type);
        updateMoveCounter(type);
        updateNavigationButtons(type);

        showMessage(`Loaded game: ${game.metadata.White || 'Unknown'} vs ${game.metadata.Black || 'Unknown'}`, 'success');

    } catch (error) {
        showMessage('Error loading game', 'error');
        console.error('Game Load Error:', error);
    }
}

/**
 * Game Navigation Features
 */
function navigateToMove(moveIndex, type) {
    clearAllAnnotations(); // Clear annotations before navigating to a move
    if (!currentGame || currentGame.type !== type) return;
    const maxMoves = currentGame.moves.length;
    // Handle special cases
    if (moveIndex === -1) moveIndex = maxMoves; // Last move
    if (moveIndex < 0) moveIndex = 0; // First move
    if (moveIndex > maxMoves) moveIndex = maxMoves; // Last move
    // Create a new chess instance and replay moves
    const tempChess = new Chess();
    for (let i = 0; i < moveIndex; i++) {
        const move = currentGame.moves[i];
        tempChess.move(move);
    }
    // Update the current game's chess instance and the board
    currentGame.chess = tempChess;
    chess = tempChess; // Sync the main chess instance
    annotationBoard.position(tempChess.fen());
    moveBoard.position(tempChess.fen());
    currentMoveIndex = moveIndex;
    
    // Update base position to current position (so annotations reset to this position)
    basePosition = tempChess.fen();
    console.log('=== navigateToMove ===');
    console.log('Updated basePosition to:', basePosition);
    
    // Also update setup board to match
    if (setupBoard) {
        setupBoard.position(tempChess.fen());
    }
    // Update move board to match
    updateMoveBoard();
    // Clear any move highlights
    removeAllMoveBoardHighlights();
    selectedSquare = null;
    legalMoves = [];
    updateMoveCounter(type);
    updateNavigationButtons(type);
    // Update turn indicator
    updateTurnIndicator();
    // Update arrows for current move
    if (overlay) {
        overlay.clearAPIDrawn();
        const arrows = arrowsByMoveIndex[currentMoveIndex] || [];
        for (let arrow of arrows) {
            overlay.drawArrowFromTo(arrow.from, arrow.to, arrow.color);
        }
    }
    // --- SYNC ANNOTATION ARROWS/LINE ---
    // Set annotationLine and annotationLineIndex to match moveIndex
    annotationLine = [];
    annotationLineIndex = 0;
    if (arrowsByMoveIndex[currentMoveIndex]) {
        // Rebuild annotationLine up to this move
        let tempC = new Chess(basePosition);
        for (let i = 0; i < arrowsByMoveIndex[currentMoveIndex].length; i++) {
            const arrow = arrowsByMoveIndex[currentMoveIndex][i];
            let move = tempC.move({ from: arrow.from, to: arrow.to });
            if (move) {
                annotationLine.push({ from: arrow.from, to: arrow.to, color: arrow.color, width: arrow.width, opacity: arrow.opacity, fen: tempC.fen() });
                annotationLineIndex = annotationLine.length;
            }
        }
    }
    renderAnnotationMoveList();
}

function updateMoveCounter(type) {
    const moveCounter = type === 'sample' ? document.getElementById('moveCounter') : document.getElementById('uploadedMoveCounter');
    const maxMoves = currentGame && currentGame.type === type ? currentGame.moves.length : 0;
    
    // Update the input field with current move number
    if (moveCounter) {
        moveCounter.value = currentMoveIndex;
        moveCounter.max = maxMoves;
    }
    
    // Update the total moves display (the span after the input)
    const moveCounterContainer = moveCounter ? moveCounter.parentElement : null;
    if (moveCounterContainer) {
        const totalMovesSpan = moveCounterContainer.querySelector('span:last-child');
        if (totalMovesSpan) {
            totalMovesSpan.textContent = `/${maxMoves}`;
        }
    }
}

function updateNavigationButtons(type) {
    const maxMoves = currentGame && currentGame.type === type ? currentGame.moves.length : 0;

    if (type === 'sample') {
        document.getElementById('firstMoveBtn').disabled = currentMoveIndex === 0;
        document.getElementById('prevMoveBtn').disabled = currentMoveIndex === 0;
        document.getElementById('nextMoveBtn').disabled = currentMoveIndex >= maxMoves;
        document.getElementById('lastMoveBtn').disabled = currentMoveIndex >= maxMoves;
    } else {
        document.getElementById('uploadedFirstMoveBtn').disabled = currentMoveIndex === 0;
        document.getElementById('uploadedPrevMoveBtn').disabled = currentMoveIndex === 0;
        document.getElementById('uploadedNextMoveBtn').disabled = currentMoveIndex >= maxMoves;
        document.getElementById('uploadedLastMoveBtn').disabled = currentMoveIndex >= maxMoves;
    }
}

function goToSpecificMove(type) {
    if (!currentGame || currentGame.type !== type) return;

    const moveCounter = type === 'sample' ? document.getElementById('moveCounter') : document.getElementById('uploadedMoveCounter');
    const moveNumber = parseInt(moveCounter.value);

    if (isNaN(moveNumber) || moveNumber < 0) {
        showMessage('Please enter a valid move number (0 or greater)', 'error');
        return;
    }

    const maxMoves = currentGame.moves.length;
    if (moveNumber > maxMoves) {
        showMessage(`Move number cannot exceed ${maxMoves}`, 'error');
        return;
    }

    navigateToMove(moveNumber, type);
}

function showGameNavigation(type) {
    if (type === 'sample') {
        document.getElementById('gameNavigationRow').style.display = 'block';
        document.getElementById('uploadedGameNavigationRow').style.display = 'none';
    } else {
        document.getElementById('uploadedGameNavigationRow').style.display = 'block';
        document.getElementById('gameNavigationRow').style.display = 'none';
    }
}

/**
 * FEN Position Feature
 */
function loadFENPosition() {
    clearAllAnnotations(); // Clear annotations before loading FEN
    const fenInput = document.getElementById('fenInput');
    const fen = fenInput.value.trim();

    if (!fen) {
        showMessage('Please enter a valid FEN position', 'error');
        return;
    }

    try {
        // Check if the FEN is complete and specifies whose turn it is
        const fenParts = fen.split(' ');
        
        if (fenParts.length < 6) {
            showMessage('Invalid FEN format. Please provide a complete FEN with 6 parts including turn indicator.', 'error');
            return;
        }
        
        const turn = fenParts[1];
        if (turn !== 'w' && turn !== 'b') {
            showMessage('Invalid FEN format. Turn indicator must be "w" (White) or "b" (Black).', 'error');
            return;
        }
        
        // Validate FEN with chess.js
        const tempChess = new Chess(fen);
        
        // Update the chess instance and board
        chess = tempChess;
        basePosition = fen; // Set base position
        console.log('=== loadFENPosition ===');
        console.log('Setting basePosition to:', basePosition);
        console.log('Chess instance FEN:', chess.fen());
        annotationBoard.position(fen);
        moveBoard.position(fen);
        updateTurnIndicator();
        
        // Also update setup board to match
        if (setupBoard) {
            setupBoard.position(fen);
        }
        // Update move board to match
        updateMoveBoard();

        // Clear any current game
        currentGame = null;
        currentMoveIndex = 0;
        hideAllGameNavigation();

            // Clear any move highlights
    removeAllMoveBoardHighlights();
    selectedSquare = null;
    legalMoves = [];

        showMessage('FEN position loaded successfully!', 'success');

        // Update FEN input with the validated FEN
        fenInput.value = tempChess.fen();

    } catch (error) {
        showMessage('Invalid FEN position. Please check the format.', 'error');
        console.error('FEN Error:', error);
    }
}

function hideAllGameNavigation() {
    document.getElementById('gameNavigationRow').style.display = 'none';
    document.getElementById('uploadedGameNavigationRow').style.display = 'none';
    
    // Clear input fields
    const moveCounter = document.getElementById('moveCounter');
    const uploadedMoveCounter = document.getElementById('uploadedMoveCounter');
    
    if (moveCounter) moveCounter.value = '0';
    if (uploadedMoveCounter) uploadedMoveCounter.value = '0';
}

/**
 * Utility Functions
 */
function showMessage(message, type = 'success') {
    const toastContainer = document.getElementById('toastContainer');
    
    // Create toast element
    const toast = document.createElement('div');
    toast.className = `toast ${type}`;
    toast.innerHTML = `
        <span>${message}</span>
        <button onclick="this.parentElement.remove()">&times;</button>
    `;
    
    // Add to container
    toastContainer.appendChild(toast);
    
    // Trigger animation
    setTimeout(() => {
        toast.classList.add('show');
    }, 10);
    
    // Auto-hide after 3 seconds
    setTimeout(() => {
        if (toast.parentNode) {
            toast.classList.remove('show');
            setTimeout(() => {
                if (toast.parentNode) {
                    toast.remove();
                }
            }, 300);
        }
    }, 3000);
}

/**
 * Update arrow settings for future annotations
 */
function updateArrowSettings() {
    if (!overlay) {
        console.log('Overlay not available for arrow settings update');
        return;
    }
    
    const color = document.getElementById('arrowColor').value;
    const size = parseInt(document.getElementById('arrowSize').value);
    const opacity = parseInt(document.getElementById('arrowOpacity').value);
    
    // Calculate head size as a proportion of the arrow size
    const headSize = Math.max(5, Math.min(30, Math.round(size * 1.5)));

    overlay.updateArrowSettings({
        color: color,
        width: size,
        headSize: headSize,
        opacity: opacity
    });
}

/**
 * Update circle settings for future annotations
 */
function updateCircleSettings() {
    if (!overlay) {
        console.log('Overlay not available for circle settings update');
        return;
    }
    
    const color = document.getElementById('circleColor').value;
    const width = parseInt(document.getElementById('circleWidth').value);
    const opacity = parseInt(document.getElementById('circleOpacity').value);
    
    overlay.updateCircleSettings({
        color: color,
        thickness: width,
        opacity: opacity
    });
}

/**
 * Clear all annotations
 */
function clearAllAnnotations() {
    console.log('=== clearAllAnnotations called ===');
    console.log('basePosition before clearing:', basePosition);
    
    if (overlay) {
        overlay.clearAll();
    }
    
    // Reset annotation line and move board
    annotationLine = [];
    annotationLineIndex = 0;
    // Clear arrows for all moves
    arrowsByMoveIndex = {};
    
    // Reset both boards to the base position
    console.log('Setting moveBoard position to:', basePosition);
    if (moveBoard) moveBoard.position(basePosition);
    console.log('Setting annotationBoard position to:', basePosition);
    if (annotationBoard) annotationBoard.position(basePosition);
    
    // Reset chess instance to base position
    console.log('Resetting chess instance with basePosition:', basePosition);
    if (basePosition === 'start') {
        chess = new Chess();
        console.log('Created new chess instance for start position');
    } else {
        chess.load(basePosition);
        console.log('Loaded chess instance with FEN:', basePosition);
    }
    console.log('Chess instance FEN after reset:', chess.fen());
    updateTurnIndicator();
    
    // Clear any move highlights
    removeAllMoveBoardHighlights();
    selectedSquare = null;
    legalMoves = [];
    
    // Clear any pending promotion
    if (pendingPromotion) {
        pendingPromotion = null;
        const modal = bootstrap.Modal.getInstance(document.getElementById('promotionModal'));
        if (modal) {
            modal.hide();
        }
    }
    
    // Clear any pending annotation promotion
    if (pendingAnnotationPromotion) {
        pendingAnnotationPromotion = null;
        const modal = bootstrap.Modal.getInstance(document.getElementById('promotionModal'));
        if (modal) {
            modal.hide();
        }
    }
    
    // Clear move list
    renderAnnotationMoveList();
}

/**
 * Promotion Modal Functions
 */
function initializePromotionModal() {
    // Add event listeners to promotion piece buttons
    document.querySelectorAll('.promotion-piece').forEach(button => {
        button.addEventListener('click', (e) => {
            const piece = e.currentTarget.getAttribute('data-piece');
            // NEW: handle annotation or normal promotion
            if (pendingAnnotationPromotion) {
                completeAnnotationPromotion(piece);
            } else {
                completePromotion(piece);
            }
        });
    });
    // Handle modal close (cancel promotion)
    const promotionModal = document.getElementById('promotionModal');
    promotionModal.addEventListener('hidden.bs.modal', () => {
        if (pendingPromotion) {
            // Cancel the promotion - snap the piece back
            pendingPromotion = null;
            removeAllHighlights();
            selectedSquare = null;
            legalMoves = [];
        }
        // NEW: cancel annotation promotion
        if (pendingAnnotationPromotion) {
            pendingAnnotationPromotion = null;
        }
    });
}

function showPromotionModal(color) {
    // Update piece images based on color
    const pieces = ['q', 'r', 'b', 'n'];
    pieces.forEach(piece => {
        const button = document.querySelector(`[data-piece="${piece}"]`);
        const img = button.querySelector('img');
        img.src = `images/chesspieces/wikipedia/${color}${piece.toUpperCase()}.png`;
    });
    
    // Show the modal
    const modal = new bootstrap.Modal(document.getElementById('promotionModal'));
    modal.show();
}

function completePromotion(promotionPiece) {
    if (!pendingPromotion) {
        return;
    }
    
    // Make the move with the chosen promotion piece
    const move = chess.move({
        from: pendingPromotion.source,
        to: pendingPromotion.target,
        promotion: promotionPiece
    });
    
    if (move === null) {
        showMessage('Invalid promotion move', 'error');
        return;
    }
    
    // Store promotion details before clearing
    const promotionSource = pendingPromotion.source;
    const promotionTarget = pendingPromotion.target;
    
    // Clear highlights and pending promotion
    removeAllMoveBoardHighlights();
    selectedSquare = null;
    legalMoves = [];
    pendingPromotion = null;
    
    // Update only the move board
    moveBoard.position(chess.fen());
    updateTurnIndicator();
    
    // Draw arrow on annotation board
    const arrowColor = document.getElementById('arrowColor').value;
    const arrowWidth = parseInt(document.getElementById('arrowSize').value);
    const arrowOpacity = parseInt(document.getElementById('arrowOpacity').value) / 100;
    const arrowHeadType = window.arrowHeadType || 'default';
    if (overlay) {
        overlay.drawArrowFromTo(promotionSource, promotionTarget, arrowColor); // Use current arrow color
    }
    
    // Update annotation line for tracking
    annotationLine.push({ from: promotionSource, to: promotionTarget, color: arrowColor, width: arrowWidth, opacity: arrowOpacity, fen: chess.fen() });
    annotationLineIndex = annotationLine.length;
    if (!arrowsByMoveIndex[currentMoveIndex]) arrowsByMoveIndex[currentMoveIndex] = [];
    arrowsByMoveIndex[currentMoveIndex].push({ from: promotionSource, to: promotionTarget, color: arrowColor, width: arrowWidth, opacity: arrowOpacity });
    
    // Update move list
    renderAnnotationMoveList();
    
    // Hide the modal
    const modal = bootstrap.Modal.getInstance(document.getElementById('promotionModal'));
    if (modal) {
        modal.hide();
    }
}

function initializeMoveBoard() {

    if (!moveBoard) {
        const moveBoardDiv = document.querySelector('.move-board');
        moveBoardDiv.id = 'move-board';

        // Get current position from chess instance
        const currentPosition = chess.fen();

        moveBoard = Chessboard(moveBoardDiv, {
            pieceTheme: 'images/chesspieces/wikipedia/{piece}.png',
            position: currentPosition,
            draggable: true,
            sparePieces: false,
            showNotation: true,
            onDrop: onMoveBoardDrop,
            onDragStart: onMoveBoardDragStart,
            onMouseoverSquare: onMoveBoardMouseoverSquare,
            onMouseoutSquare: onMoveBoardMouseoutSquare
        });
    }
}

// Helper to add an annotation arrow and update move board
function addAnnotationArrow(from, to, color) {
    // Only allow arrowwork, not moves, on the annotation board
    // When an arrow is drawn, execute the move on the move board (if legal)
    let tempChess = new Chess(chess.fen());
    // Detect if this is a pawn promotion
    let piece = tempChess.get(from);
    let isPromotion = false;
    if (piece && piece.type === 'p') {
        if ((piece.color === 'w' && to[1] === '8') || (piece.color === 'b' && to[1] === '1')) {
            // Check if this is a legal promotion move
            const legalMoves = tempChess.moves({ square: from, verbose: true });
            isPromotion = legalMoves.some(move => move.to === to && move.promotion);
        }
    }
    if (isPromotion) {
        // Store pending annotation promotion details
        pendingAnnotationPromotion = { from, to, color, basePosition: chess.fen(), pieceColor: piece.color };
        showPromotionModal(piece.color);
        return;
    }
    // Normal annotation move
    let move = tempChess.move({ from, to });
    if (!move) return; // Illegal move, do nothing
    
    // Update only the move board and chess state
    chess = tempChess;
    moveBoard.position(tempChess.fen());
    updateTurnIndicator();

    // Draw arrow on annotation board (on the original position)
    if (overlay) {
        overlay.drawArrowFromTo(from, to, color);
    }

    // Update annotation line for tracking
    const arrowWidth = parseInt(document.getElementById('arrowSize').value);
    const arrowOpacity = parseInt(document.getElementById('arrowOpacity').value) / 100;
    const arrowHeadType = window.arrowHeadType || 'default';
    annotationLine.push({ from, to, color, width: arrowWidth, opacity: arrowOpacity, fen: tempChess.fen() });
    annotationLineIndex = annotationLine.length;
    if (!arrowsByMoveIndex[currentMoveIndex]) arrowsByMoveIndex[currentMoveIndex] = [];
    arrowsByMoveIndex[currentMoveIndex].push({ from, to, color, width: arrowWidth, opacity: arrowOpacity });
    
    // Update move list
    renderAnnotationMoveList();
}

function updateMoveBoardAndOverlay() {
    // The annotation board should always show the base position (never the moves)
    let moveBoardPosition;
    let tempChess;
    if (annotationLineIndex === 0) {
        moveBoardPosition = basePosition === 'start' ? new Chess().fen() : basePosition;
        tempChess = basePosition === 'start' ? new Chess() : new Chess(basePosition);
    } else {
        moveBoardPosition = annotationLine[annotationLineIndex - 1].fen;
        tempChess = new Chess(moveBoardPosition);
    }
    // Update move board to current position in annotation line
    if (moveBoard) moveBoard.position(moveBoardPosition);
    // Annotation board always stays at base position
    if (annotationBoard) {
        const annotationBase = basePosition === 'start' ? new Chess().fen() : basePosition;
        annotationBoard.position(annotationBase);
    }
    chess = tempChess;
    updateTurnIndicator();
    // Redraw arrows up to annotationLineIndex on annotation board
    if (overlay) {
        overlay.clearAll(); // Clear all arrows, not just API-drawn
        for (let i = 0; i < annotationLineIndex; i++) {
            const arrow = annotationLine[i];
            overlay.drawArrowFromTo(arrow.from, arrow.to, arrow.color);
        }
    }
    // Render annotation move list
    renderAnnotationMoveList();
    // Update navigation button states and highlights
    updateAnnotationNavigationButtons();
}

function renderAnnotationMoveList() {
    const moveListDiv = document.getElementById('annotationMoveList');
    if (!moveListDiv) return;
    
    if (annotationLine.length === 0) {
        moveListDiv.innerHTML = '<em class="text-muted">No moves/annotations yet</em>';
        moveListDiv.style.display = 'block';
        return;
    }
    // Build SAN move list
    let tempChess;
    // Use the base position as the starting point
    let baseFen = basePosition;
    
    // Handle the case where basePosition is 'start'
    if (baseFen === 'start') {
        tempChess = new Chess();
    } else {
        tempChess = new Chess(baseFen);
    }
    let sanMoves = [];
    for (let i = 0; i < annotationLine.length; i++) {
        const moveObj = annotationLine[i];
        let legalMoves = tempChess.moves({ verbose: true });
        // Match promotion if present
        let move = legalMoves.find(m => m.from === moveObj.from && m.to === moveObj.to && ((moveObj.promotion && m.promotion === moveObj.promotion) || (!moveObj.promotion && !m.promotion)));
        if (move) {
            sanMoves.push(move.san);
            tempChess.move(move);
        }
    }
    if (sanMoves.length === 0) {
        moveListDiv.innerHTML = '<em class="text-muted">No moves/annotations yet</em>';
        moveListDiv.style.display = 'block';
        return;
    }
    // Render as a compact list with highlighting that can wrap
    moveListDiv.innerHTML = sanMoves.map((san, idx) => {
        let highlight = (idx < annotationLineIndex) ? 'fw-bold text-primary' : 'text-muted';
        return `<span class="me-2 ${highlight}">${san}</span>`;
    }).join('');
    moveListDiv.style.display = 'block';
    
    // Update navigation button states
    updateAnnotationNavigationButtons();
}

function navigateAnnotationLine(direction) {
    if (annotationLine.length === 0) return;
    if (direction === 'start') {
        annotationLineIndex = 0;
    } else if (direction === 'prev') {
        annotationLineIndex = Math.max(0, annotationLineIndex - 1);
    } else if (direction === 'next') {
        annotationLineIndex = Math.min(annotationLine.length, annotationLineIndex + 1);
    } else if (direction === 'end') {
        annotationLineIndex = annotationLine.length;
    }
    updateMoveBoardAndOverlay();
}

/**
 * Update move board to match current chess position
 */
function updateMoveBoard() {
    if (moveBoard) {
        moveBoard.position(chess.fen());
    }
}

/**
 * Update turn indicator
 */
function updateTurnIndicator() {
    const turnIndicator = document.getElementById('turnIndicator');
    if (turnIndicator && chess) {
        const turn = chess.turn();
        const turnText = turn === 'w' ? 'White to move' : 'Black to move';
        const turnClass = turn === 'w' ? 'bg-light text-dark border border-dark' : 'bg-dark text-light border border-dark';
        turnIndicator.textContent = turnText;
        turnIndicator.className = `badge ${turnClass}`;
    }
}

// Complete annotation promotion
function completeAnnotationPromotion(promotionPiece) {
    if (!pendingAnnotationPromotion) return;
    let { from, to, color, basePosition, pieceColor } = pendingAnnotationPromotion;
    let tempChess = new Chess();
    tempChess.load(basePosition);
    let move = tempChess.move({ from, to, promotion: promotionPiece });
    if (!move) {
        showMessage('Invalid promotion move', 'error');
        pendingAnnotationPromotion = null;
        const modal = bootstrap.Modal.getInstance(document.getElementById('promotionModal'));
        if (modal) modal.hide();
        return;
    }
    let fen = tempChess.fen();
    // Store promotion in annotationLine for provenance
    annotationLine.push({ from, to, color, fen, promotion: promotionPiece });
    annotationLineIndex = annotationLine.length;
    
    // Update chess instance and move board
    chess = tempChess;
    moveBoard.position(tempChess.fen());
    updateTurnIndicator();
    
    // Draw arrow on annotation board
    if (overlay) {
        overlay.drawArrowFromTo(from, to, color);
    }
    
    // Update arrows tracking
    if (!arrowsByMoveIndex[currentMoveIndex]) arrowsByMoveIndex[currentMoveIndex] = [];
    arrowsByMoveIndex[currentMoveIndex].push({ from, to, color });
    
    // Update move list
    renderAnnotationMoveList();
    
    pendingAnnotationPromotion = null;
    // Hide the modal
    const modal = bootstrap.Modal.getInstance(document.getElementById('promotionModal'));
    if (modal) modal.hide();
}

// Voice annotation logic
let recognition = null;
let isListening = false;

function startVoiceAnnotation() {
    // Check for speech recognition support
    if (!('webkitSpeechRecognition' in window) && !('SpeechRecognition' in window)) {
        showMessage('Voice annotation not supported in this browser. Please use Chrome, Edge, or Safari 14.1+', 'error');
        return;
    }

    const SpeechRecognition = window.SpeechRecognition || window.webkitSpeechRecognition;
    
    // Create new recognition instance each time for better Safari compatibility
    recognition = new SpeechRecognition();
    
    // Safari-specific configurations
    recognition.continuous = true; // Keep listening until stopped
    recognition.interimResults = false;
    recognition.maxAlternatives = 3; // Get multiple alternatives for better accuracy
    recognition.lang = 'en-US';
    
    const status = document.getElementById('voiceAnnotateStatus');
    const voiceBtn = document.getElementById('voiceAnnotateBtn');
    
    if (isListening) {
        // Stop listening
        recognition.stop();
        isListening = false;
        status.textContent = '';
        voiceBtn.innerHTML = '<i class="bi bi-mic"></i> Speak';
        voiceBtn.classList.remove('btn-danger');
        voiceBtn.classList.add('btn-outline-secondary');
        return;
    }
    
    // Start listening
    isListening = true;
    status.textContent = 'Listening... (click again to stop)';
    voiceBtn.innerHTML = '<i class="bi bi-mic-mute"></i> Stop';
    voiceBtn.classList.remove('btn-outline-secondary');
    voiceBtn.classList.add('btn-danger');
    
    recognition.start();
    
    recognition.onresult = function(event) {
        const results = event.results;
        const lastResult = results[results.length - 1];
        
        if (lastResult.isFinal) {
            let transcript = lastResult[0].transcript.trim().toLowerCase();
            status.textContent = `Heard: "${transcript}"`;
            console.log('Voice input:', transcript);
            processSpokenMove(transcript);
        }
    };
    
    recognition.onerror = function(event) {
        console.error('Speech recognition error:', event.error);
        status.textContent = 'Error: ' + event.error;
        
        // Handle specific Safari errors
        if (event.error === 'not-allowed') {
            showMessage('Microphone access denied. Please allow microphone access in your browser settings.', 'error');
        } else if (event.error === 'no-speech') {
            status.textContent = 'No speech detected. Try speaking more clearly.';
        } else if (event.error === 'audio-capture') {
            showMessage('Audio capture failed. Please check your microphone.', 'error');
        } else {
            showMessage('Voice error: ' + event.error, 'error');
        }
        
        // Reset button state
        isListening = false;
        voiceBtn.innerHTML = '<i class="bi bi-mic"></i> Speak';
        voiceBtn.classList.remove('btn-danger');
        voiceBtn.classList.add('btn-outline-secondary');
    };
    
    recognition.onend = function() {
        console.log('Speech recognition ended');
        if (isListening) {
            // Restart if we're still supposed to be listening (Safari sometimes ends prematurely)
            setTimeout(() => {
                if (isListening) {
                    recognition.start();
                }
            }, 100);
        } else {
            status.textContent = '';
            voiceBtn.innerHTML = '<i class="bi bi-mic"></i> Speak';
            voiceBtn.classList.remove('btn-danger');
            voiceBtn.classList.add('btn-outline-secondary');
        }
    };
    
    recognition.onstart = function() {
        console.log('Speech recognition started');
        status.textContent = 'Listening... (click again to stop)';
    };
}

function processSpokenMove(transcript) {
    // Try to parse as SAN or common spoken forms
    // e.g. "e4", "knight f6", "bishop takes c4", "castle kingside"
    let move = spokenToSan(transcript);
    if (!move) {
        showMessage('Could not parse move: ' + transcript, 'error');
        return;
    }
    // Try to apply move to annotation line
    let basePosition = annotationLine.length === 0 ? chess.fen() : annotationLine[annotationLine.length - 1].fen;
    let tempChess = new Chess();
    tempChess.load(basePosition);
    let legalMoves = tempChess.moves({ verbose: true });
    let found = null;
    for (let m of legalMoves) {
        if (m.san.toLowerCase() === move.toLowerCase()) {
            found = m;
            break;
        }
    }
    if (!found) {
        showMessage('Illegal move: ' + move, 'error');
        return;
    }
    // Draw arrow and update annotation line
    addAnnotationArrow(found.from, found.to, document.getElementById('arrowColor').value);
}

function spokenToSan(transcript) {
    // Basic mapping for common spoken forms
    transcript = transcript.replace(/\s+/g, ' ').trim().toLowerCase();
    
    // Handle castling with more variations
    if (transcript.includes('castle kingside') || transcript.includes('castle king side') || transcript.includes('kingside castle')) return 'O-O';
    if (transcript.includes('castle queenside') || transcript.includes('castle queen side') || transcript.includes('queenside castle')) return 'O-O-O';
    
    // Replace piece names with more variations
    transcript = transcript.replace(/knight/g, 'N')
        .replace(/bishop/g, 'B')
        .replace(/rook/g, 'R')
        .replace(/queen/g, 'Q')
        .replace(/king/g, 'K')
        .replace(/night/g, 'N') // Common misrecognition
        .replace(/bish/g, 'B') // Partial recognition
        .replace(/rook/g, 'R')
        .replace(/queen/g, 'Q');
    
    // Normalize capture phrases with more variations
    transcript = transcript.replace(/(takes|captures|capture|into|x|times)/g, 'x');
    
    // Remove common filler words
    transcript = transcript.replace(/ to | on | at | move | from | the | a | an /g, ' ');
    
    // Remove trailing punctuation
    transcript = transcript.replace(/[.,!?;:]$/, '');
    
    // Clean up extra spaces
    transcript = transcript.replace(/\s+/g, ' ').trim();
    
    console.log('Processed transcript:', transcript);
    
    // Try to match SAN patterns
    let sanPattern = /^(O-O(-O)?|[NBRQK]?[a-h]?[1-8]?x?[a-h][1-8](=[NBRQ])?)$/i;
    if (sanPattern.test(transcript)) return transcript.toUpperCase();
    
    // Try to match pawn moves like "e4"
    let pawnPattern = /^[a-h][1-8]$/;
    if (pawnPattern.test(transcript)) return transcript;
    
    // Try to match piece moves like "Nf3"
    let piecePattern = /^[NBRQK][a-h][1-8]$/;
    if (piecePattern.test(transcript)) return transcript;
    
    // Try to match captures like "Nxf3"
    let capturePattern = /^[NBRQK]x[a-h][1-8]$/;
    if (capturePattern.test(transcript)) return transcript;
    
    // Try to match promotion like "e8=Q"
    let promoPattern = /^[a-h][18]=[NBRQ]$/;
    if (promoPattern.test(transcript)) return transcript;
    
    // Try to match phrases like 'B f7' or 'B x f7' with more flexibility
    let pieceCapture = /^(B|N|R|Q|K)\s*x?\s*([a-h][1-8])$/i;
    let match = transcript.match(pieceCapture);
    if (match) {
        return match[1].toUpperCase() + (transcript.includes('x') ? 'x' : '') + match[2];
    }
    
    // Try to match coordinates like "e2 e4" or "e2 to e4"
    let coordPattern = /^([a-h][1-8])\s*(?:to\s*)?([a-h][1-8])$/i;
    match = transcript.match(coordPattern);
    if (match) {
        // Convert coordinate notation to SAN (this is a simplified approach)
        // In a real implementation, you'd need to validate the move
        return match[1] + match[2]; // This is just a placeholder
    }
    
    // Try to match "pawn to e4" or "pawn e4"
    let pawnMovePattern = /^(?:pawn\s+)?([a-h][1-8])$/i;
    match = transcript.match(pawnMovePattern);
    if (match) {
        return match[1];
    }
    
    console.log('No pattern matched for:', transcript);
    return null;
}

// Manual move input functionality
function executeManualMove(e) {
    if (e) e.preventDefault();
    const moveInputField = document.getElementById('moveInputField');
    const move = moveInputField.value.trim();
    
    if (move) {
        console.log('Manual move input:', move);
        processSpokenMove(move.toLowerCase());
        moveInputField.value = ''; // Clear the input after executing
    } else {
        showMessage('Please enter a move', 'error');
    }
}

// Attach event listeners only once after DOMContentLoaded
function initializeManualMoveInput() {
    const goMoveBtn = document.getElementById('goMoveBtn');
    const moveInputField = document.getElementById('moveInputField');
    if (goMoveBtn) goMoveBtn.addEventListener('click', executeManualMove);
    if (moveInputField) {
        moveInputField.addEventListener('keydown', function(e) {
            if (e.key === 'Enter') {
                executeManualMove(e);
            }
        });
    }
}

// Add New/Save controls in annotation mode
function addAnnotationLineControls() {
    // No longer add New, Save, or Voice buttons to the toolbar
    // Only ensure event listeners are attached to the header buttons
    const voiceBtn = document.getElementById('voiceAnnotateBtn');
    if (voiceBtn) voiceBtn.addEventListener('click', startVoiceAnnotation);
    
    const goMoveBtn = document.getElementById('goMoveBtn');
    const moveInputField = document.getElementById('moveInputField');
    
    if (goMoveBtn) goMoveBtn.addEventListener('click', executeManualMove);
    if (moveInputField) {
        moveInputField.addEventListener('keypress', function(e) {
            if (e.key === 'Enter') {
                executeManualMove();
            }
        });
    }
    
    const saveBtn = document.getElementById('saveLineBtn');
    if (saveBtn) saveBtn.addEventListener('click', saveCurrentAnnotationLine);
    const clearBtn = document.getElementById('clearAnnotationsBtn');
    if (clearBtn) clearBtn.addEventListener('click', clearAllAnnotations);
}

function removeAnnotationLineControls() {
    // No longer need to remove New or Save buttons from the toolbar
}

let savedAnnotationLines = [];
function startNewAnnotationLine() {
    clearAllAnnotations();
    showMessage('Started a new annotation line.', 'success');
}

function saveCurrentAnnotationLine() {
    console.log('=== saveCurrentAnnotationLine called ===');
    console.log('annotationLine length:', annotationLine.length);
    console.log('basePosition before saving:', basePosition);
    
    if (annotationLine.length === 0) {
        showMessage('Nothing to save. Draw some arrows first.', 'error');
        return;
    }
    // Save the current annotation line (deep copy)
    let lineCopy = JSON.parse(JSON.stringify(annotationLine));
    
    // Use the global basePosition (the original position when loaded)
    let baseFen = basePosition;
    console.log('Saving with baseFen:', baseFen);
    
    savedAnnotationLines.push({
        line: lineCopy,
        baseFen: baseFen
    });
    renderSavedAnnotationLines();
    showMessage('Annotation line saved!', 'success');
    // Reset to the original loaded position
    console.log('About to call clearAllAnnotations...');
    clearAllAnnotations();
}

function renderSavedAnnotationLines() {
    const container = document.getElementById('savedLinesContainer');
    if (!container) return;
    container.innerHTML = '';
    // Track per-mini-board move index
    if (!window.miniBoardMoveIndexes) window.miniBoardMoveIndexes = [];
    savedAnnotationLines.forEach((saved, idx) => {
        // Build SAN move list starting from the base position
        let tempChess;
        if (saved.baseFen === 'start') {
            tempChess = new Chess();
        } else {
            tempChess = new Chess(saved.baseFen);
        }
        let sanMoves = [];
        for (let i = 0; i < saved.line.length; i++) {
            const moveObj = saved.line[i];
            let legalMoves = tempChess.moves({ verbose: true });
            let move = legalMoves.find(m => m.from === moveObj.from && m.to === moveObj.to && ((moveObj.promotion && m.promotion === moveObj.promotion) || (!moveObj.promotion && !m.promotion)));
            if (move) {
                sanMoves.push(move.san);
                tempChess.move(move);
            }
        }
        // Create mini-board card in Bootstrap grid
        let col = document.createElement('div');
        col.className = 'col-md-3';
        let card = document.createElement('div');
        card.className = 'card';
        card.innerHTML = `
            <div class="card-header">
                <span><strong>Line ${idx + 1}</strong></span>
                <button class="btn btn-xs btn-light float-right close-saved-line" title="Delete" data-idx="${idx}">&times;</button>
            </div>
            <div class="card-body">
                <div class="mini-move-board mb-2" id="miniBoard${idx}"></div>
                <div class="annotation-move-list mb-2" id="miniMoveList${idx}">${sanMoves.map(san => `<span class='me-2'>${san}</span>`).join(' ')}</div>
                <div class="move-nav-btns">
                    <button type="button" class="btn btn-outline-secondary btn-xs mini-first" data-idx="${idx}" title="First Position"><i class="bi bi-skip-backward"></i></button>
                    <button type="button" class="btn btn-outline-secondary btn-xs mini-prev" data-idx="${idx}" title="Previous Position"><i class="bi bi-chevron-left"></i></button>
                    <button type="button" class="btn btn-outline-secondary btn-xs mini-next" data-idx="${idx}" title="Next Position"><i class="bi bi-chevron-right"></i></button>
                    <button type="button" class="btn btn-outline-secondary btn-xs mini-last" data-idx="${idx}" title="Last Position"><i class="bi bi-skip-forward"></i></button>
                </div>
            </div>
        `;
        col.appendChild(card);
        container.appendChild(col);
        // Set up mini-board navigation state - default to final position
        if (window.miniBoardMoveIndexes.length <= idx) window.miniBoardMoveIndexes[idx] = saved.line.length;
        // Render the mini-board showing the final position by default
        setTimeout(() => {
            renderMiniBoardPosition(idx);
        }, 0);
    });
    // Add delete handler for close buttons
    container.querySelectorAll('.close-saved-line').forEach(btn => {
        btn.addEventListener('click', function() {
            const idx = parseInt(this.getAttribute('data-idx'));
            savedAnnotationLines.splice(idx, 1);
            window.miniBoardMoveIndexes.splice(idx, 1);
            renderSavedAnnotationLines();
        });
    });
    // Add navigation handlers
    container.querySelectorAll('.mini-first').forEach(btn => {
        btn.addEventListener('click', function() {
            const idx = parseInt(this.getAttribute('data-idx'));
            window.miniBoardMoveIndexes[idx] = 0;
            renderMiniBoardPosition(idx);
        });
    });
    container.querySelectorAll('.mini-prev').forEach(btn => {
        btn.addEventListener('click', function() {
            const idx = parseInt(this.getAttribute('data-idx'));
            window.miniBoardMoveIndexes[idx] = Math.max(0, window.miniBoardMoveIndexes[idx] - 1);
            renderMiniBoardPosition(idx);
        });
    });
    container.querySelectorAll('.mini-next').forEach(btn => {
        btn.addEventListener('click', function() {
            const idx = parseInt(this.getAttribute('data-idx'));
            const max = savedAnnotationLines[idx].line.length;
            window.miniBoardMoveIndexes[idx] = Math.min(max, window.miniBoardMoveIndexes[idx] + 1);
            renderMiniBoardPosition(idx);
        });
    });
    container.querySelectorAll('.mini-last').forEach(btn => {
        btn.addEventListener('click', function() {
            const idx = parseInt(this.getAttribute('data-idx'));
            window.miniBoardMoveIndexes[idx] = savedAnnotationLines[idx].line.length;
            renderMiniBoardPosition(idx);
        });
    });
}

// Helper to render a mini-board at a given move index
function renderMiniBoardPosition(idx) {
    const saved = savedAnnotationLines[idx];
    const moveIdx = window.miniBoardMoveIndexes[idx] || 0;
    let tempChess = (saved.baseFen === 'start') ? new Chess() : new Chess(saved.baseFen);
    let sanMoves = [];
    for (let i = 0; i < moveIdx; i++) {
        const moveObj = saved.line[i];
        let legalMoves = tempChess.moves({ verbose: true });
        let move = legalMoves.find(m => m.from === moveObj.from && m.to === moveObj.to && ((moveObj.promotion && m.promotion === moveObj.promotion) || (!moveObj.promotion && !m.promotion)));
        if (move) {
            sanMoves.push(move.san);
            tempChess.move(move);
        }
    }
    // Update mini-board
    Chessboard(`miniBoard${idx}`, {
        pieceTheme: 'images/chesspieces/wikipedia/{piece}.png',
        position: tempChess.fen(),
        draggable: false,
        showNotation: false
    });

    // --- ARROW OVERLAY LOGIC ---
    // Add overlay canvas if not present
    let miniBoardDiv = document.getElementById(`miniBoard${idx}`);
    if (miniBoardDiv && !miniBoardDiv.querySelector('.mini-arrow-canvas')) {
        let canvas = document.createElement('canvas');
        canvas.className = 'mini-arrow-canvas';
        canvas.style.position = 'absolute';
        canvas.style.top = '0';
        canvas.style.left = '0';
        canvas.style.pointerEvents = 'none';
        canvas.width = miniBoardDiv.offsetWidth;
        canvas.height = miniBoardDiv.offsetHeight;
        miniBoardDiv.style.position = 'relative';
        miniBoardDiv.appendChild(canvas);
    }
    // Get the overlay canvas
    let arrowCanvas = miniBoardDiv ? miniBoardDiv.querySelector('.mini-arrow-canvas') : null;
    // Clear the canvas
    if (arrowCanvas) {
        let ctx = arrowCanvas.getContext('2d');
        ctx.clearRect(0, 0, arrowCanvas.width, arrowCanvas.height);
    }
    // Draw arrows up to moveIdx
    if (arrowCanvas && moveIdx > 0) {
        let squareSize = arrowCanvas.width / 8;
        for (let i = 0; i < moveIdx; i++) {
            const moveObj = saved.line[i];
            drawMiniArrow(arrowCanvas, moveObj.from, moveObj.to, moveObj.color || '#007bff', squareSize, moveObj.width, moveObj.opacity);
        }
    }

    // Update move list to highlight current move
    const moveListDiv = document.getElementById(`miniMoveList${idx}`);
    if (moveListDiv) {
        let allMoves = [];
        let tempC = (saved.baseFen === 'start') ? new Chess() : new Chess(saved.baseFen);
        for (let i = 0; i < saved.line.length; i++) {
            const moveObj = saved.line[i];
            let legalMoves = tempC.moves({ verbose: true });
            let move = legalMoves.find(m => m.from === moveObj.from && m.to === moveObj.to && ((moveObj.promotion && m.promotion === moveObj.promotion) || (!moveObj.promotion && !m.promotion)));
            if (move) {
                let highlight = (i < moveIdx) ? 'fw-bold text-primary' : 'text-muted';
                allMoves.push(`<span class='me-2 ${highlight}'>${move.san}</span>`);
                tempC.move(move);
            }
        }
        moveListDiv.innerHTML = allMoves.join(' ');
    }
    // Disable/enable nav buttons
    const card = document.getElementById(`miniBoard${idx}`)?.closest('.card');
    if (card) {
        card.querySelector('.mini-first').disabled = moveIdx === 0;
        card.querySelector('.mini-prev').disabled = moveIdx === 0;
        card.querySelector('.mini-next').disabled = moveIdx === saved.line.length;
        card.querySelector('.mini-last').disabled = moveIdx === saved.line.length;
    }
}

// Helper to draw an arrow on a mini-board canvas
function drawMiniArrow(canvas, from, to, color, squareSize, width = 6, opacity = 0.8) {
    function squareToXY(square) {
        const file = square.charCodeAt(0) - 'a'.charCodeAt(0);
        const rank = 8 - parseInt(square[1]);
        return {
            x: file * squareSize + squareSize / 2,
            y: rank * squareSize + squareSize / 2
        };
    }
    const ctx = canvas.getContext('2d');
    const start = squareToXY(from);
    const end = squareToXY(to);
    ctx.save();
    ctx.strokeStyle = color;
    ctx.lineWidth = width || 6;
    ctx.globalAlpha = opacity != null ? opacity : 0.8;
    ctx.lineCap = 'round';
    // Calculate arrow head size
    const headlen = Math.max(10, Math.round((width || 6) * 2));
    // Calculate the direction
    const dx = end.x - start.x;
    const dy = end.y - start.y;
    const len = Math.sqrt(dx * dx + dy * dy);
    // Shorten the line so the head sits at the end
    const ratio = (len - headlen) / len;
    const lineEndX = start.x + dx * ratio;
    const lineEndY = start.y + dy * ratio;
    // Draw the shaft
    ctx.beginPath();
    ctx.moveTo(start.x, start.y);
    ctx.lineTo(lineEndX, lineEndY);
    ctx.stroke();
    // Draw the head as a filled triangle
    ctx.beginPath();
    ctx.moveTo(end.x, end.y);
    const angle = Math.atan2(dy, dx);
    ctx.lineTo(
        end.x - headlen * Math.cos(angle - Math.PI / 6),
        end.y - headlen * Math.sin(angle - Math.PI / 6)
    );
    ctx.lineTo(
        end.x - headlen * Math.cos(angle + Math.PI / 6),
        end.y - headlen * Math.sin(angle + Math.PI / 6)
    );
    ctx.closePath();
    ctx.fillStyle = color;
    ctx.globalAlpha = opacity != null ? opacity : 0.8;
    ctx.fill();
    ctx.restore();
}

// Initialize annotation line controls (always available)
addAnnotationLineControls();

function updateAnnotationNavigationButtons() {
    const firstBtn = document.getElementById('annotationFirstBtn');
    const prevBtn = document.getElementById('annotationPrevBtn');
    const nextBtn = document.getElementById('annotationNextBtn');
    const lastBtn = document.getElementById('annotationLastBtn');
    if (!firstBtn || !prevBtn || !nextBtn || !lastBtn) return;
    const len = annotationLine.length;
    const idx = annotationLineIndex;

    // Enable/disable logic - disable all if no moves
    const hasMoves = len > 0;
    firstBtn.disabled = !hasMoves || idx === 0;
    prevBtn.disabled = !hasMoves || idx === 0;
    nextBtn.disabled = !hasMoves || idx === len;
    lastBtn.disabled = !hasMoves || idx === len;

    // Always use outline style, never highlight
    firstBtn.classList.remove('btn-primary');
    prevBtn.classList.remove('btn-primary');
    nextBtn.classList.remove('btn-primary');
    lastBtn.classList.remove('btn-primary');
    firstBtn.classList.add('btn-outline-secondary');
    prevBtn.classList.add('btn-outline-secondary');
    nextBtn.classList.add('btn-outline-secondary');
    lastBtn.classList.add('btn-outline-secondary');
}

/**
 * Initialize the professional drawing toolbar
 */
function initializeDrawingToolbar() {
    // Arrow controls
    const arrowColor = document.getElementById('arrowColor');
    const arrowSize = document.getElementById('arrowSize');
    const arrowOpacity = document.getElementById('arrowOpacity');
    const arrowOpacityValue = document.getElementById('arrowOpacityValue');
    
    // Circle controls
    const circleColor = document.getElementById('circleColor');
    const circleWidth = document.getElementById('circleWidth');
    const circleOpacity = document.getElementById('circleOpacity');
    const circleOpacityValue = document.getElementById('circleOpacityValue');
    
    // Arrow opacity handler
    arrowOpacity.addEventListener('input', (e) => {
        arrowOpacityValue.textContent = e.target.value + '%';
        updateArrowSettings();
    });
    
    // Circle opacity handler
    circleOpacity.addEventListener('input', (e) => {
        circleOpacityValue.textContent = e.target.value + '%';
        updateCircleSettings();
    });
    
    // Arrow and circle control handlers
    [arrowColor, arrowSize, circleColor, circleWidth].forEach(input => {
        input.addEventListener('change', () => {
            if (input.id.includes('arrow')) {
                updateArrowSettings();
            } else if (input.id.includes('circle')) {
                updateCircleSettings();
            }
        });
    });
    
    // Apply initial settings to the overlay
    setTimeout(() => {
        updateArrowSettings();
        updateCircleSettings();
    }, 100);
}

