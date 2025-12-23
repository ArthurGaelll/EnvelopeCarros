// frontend/src/App.js (Versão Estável: Borracha Manual + Toggle em Peças)
import React, { useState, useEffect, useRef } from 'react';
import axios from 'axios';
import { SketchPicker } from 'react-color';
import { TransformWrapper, TransformComponent } from "react-zoom-pan-pinch";
import './App.css';

// --- MATEMÁTICA: Ray Casting ---
const pointInPolygon = (point, vs) => {
    var x = point[0], y = point[1];
    var inside = false;
    for (var i = 0, j = vs.length - 1; i < vs.length; j = i++) {
        var xi = vs[i][0], yi = vs[i][1];
        var xj = vs[j][0], yj = vs[j][1];
        var intersect = ((yi > y) !== (yj > y)) && (x < (xj - xi) * (y - yi) / (yj - yi) + xi);
        if (intersect) inside = !inside;
    }
    return inside;
};

const PartGalleryCard = ({ part, color, opacity, onClick }) => {
  const canvasRef = useRef(null);
  useEffect(() => {
    const canvas = canvasRef.current;
    if(!canvas) return;
    const ctx = canvas.getContext('2d');
    const img = new Image();
    img.src = part.image;
    img.onload = () => {
      canvas.width = img.width;
      canvas.height = img.height;
      ctx.clearRect(0, 0, canvas.width, canvas.height);
      ctx.drawImage(img, 0, 0);
      if (color) {
        ctx.globalCompositeOperation = 'source-atop';
        ctx.fillStyle = color;
        ctx.globalAlpha = opacity;
        ctx.fillRect(0, 0, canvas.width, canvas.height);
        ctx.globalCompositeOperation = 'source-over';
        ctx.globalAlpha = 1.0;
      }
    };
  }, [part.image, color, opacity]);

  const activeStyle = color 
    ? { border: `2px solid ${color}`, boxShadow: `0 0 0 2px ${color}33` } 
    : { border: '1px solid #e5e7eb' };

  return (
    <div className="part-card" onClick={onClick} style={activeStyle}>
      <canvas ref={canvasRef} />
      <div className="part-label">{part.label}</div>
    </div>
  );
};

function App() {
  const [originalImage, setOriginalImage] = useState(null);
  const [imgDims, setImgDims] = useState({ w: 0, h: 0 });
  const [parts, setParts] = useState([]); 
  const [partColors, setPartColors] = useState({}); 
  const [history, setHistory] = useState([]);
  
  const [selectedColor, setSelectedColor] = useState('#4f46e5');
  const [opacity, setOpacity] = useState(0.85); 
  
  const [toolMode, setToolMode] = useState('select'); 
  const [brushSize, setBrushSize] = useState(20); 
  const [lassoPoints, setLassoPoints] = useState([]); 
  const [panningDisabled, setPanningDisabled] = useState(false);

  // Estado da Borracha (Apenas para Canvas Manual)
  const [isEraser, setIsEraser] = useState(false);

  const [loading, setLoading] = useState(false);
  const [cursorPos, setCursorPos] = useState({ x: -1000, y: -1000 });
  const [hoveredPartId, setHoveredPartId] = useState(null);
  const [paintMode, setPaintMode] = useState('normal');

  const canvasRef = useRef(null); 
  const isDrawingBrush = useRef(false);

  const getMousePos = (e) => {
    const canvas = canvasRef.current;
    if (!canvas) return { x: 0, y: 0 };
    const rect = canvas.getBoundingClientRect(); 
    const scaleX = canvas.width / rect.width;
    const scaleY = canvas.height / rect.height;
    return {
      x: (e.clientX - rect.left) * scaleX,
      y: (e.clientY - rect.top) * scaleY
    };
  };

  const sortPartsByArea = (partsList) => {
    return [...partsList].sort((a, b) => b.area - a.area);
  };

  const resetContext = (ctx) => {
    if (!ctx) return;
    ctx.shadowBlur = 0;
    ctx.shadowColor = 'transparent';
    ctx.globalCompositeOperation = 'source-over'; 
    ctx.strokeStyle = 'transparent';
    ctx.fillStyle = 'transparent';
  };

  const handleUpload = async (e) => {
    const file = e.target.files[0];
    if (!file) return;
    setLoading(true);
    setPartColors({});
    setParts([]);
    setHistory([]);
    setLassoPoints([]);
    
    if(canvasRef.current) {
      const ctx = canvasRef.current.getContext('2d');
      ctx.clearRect(0, 0, canvasRef.current.width, canvasRef.current.height);
      resetContext(ctx);
    }

    const formData = new FormData();
    formData.append('image', file);

    try {
      const res = await axios.post('http://localhost:8000/analyze_car', formData);
      setOriginalImage(res.data.original);
      setImgDims({ w: res.data.width, h: res.data.height });
      setParts(sortPartsByArea(res.data.parts));
    } catch (err) {
      alert("Erro ao processar imagem.");
    } finally {
      setLoading(false);
    }
  };

  const saveToHistory = () => {
    const canvas = canvasRef.current;
    const canvasData = canvas ? canvas.toDataURL() : null;
    setHistory(prev => [...prev, { colors: { ...partColors }, canvasData: canvasData }]);
  };

  const undoLastAction = () => {
    if (history.length === 0) return;
    const previousState = history[history.length - 1];
    setPartColors(previousState.colors);
    
    if (previousState.canvasData && canvasRef.current) {
        const ctx = canvasRef.current.getContext('2d');
        const img = new Image();
        img.src = previousState.canvasData;
        img.onload = () => {
            ctx.clearRect(0, 0, canvasRef.current.width, canvasRef.current.height);
            resetContext(ctx);
            ctx.drawImage(img, 0, 0);
        };
    } else if (canvasRef.current) {
        const ctx = canvasRef.current.getContext('2d');
        ctx.clearRect(0, 0, canvasRef.current.width, canvasRef.current.height);
    }
    setHistory(history.slice(0, -1));
    setLassoPoints([]); 
  };

  useEffect(() => {
    const handleKeyDown = (e) => {
      if ((e.ctrlKey || e.metaKey) && e.key === 'z') undoLastAction();
      if (e.key === 'Enter' && toolMode === 'lasso') finishLassoDrawing();
      if (e.key === 'Escape' && toolMode === 'lasso') setLassoPoints([]);
    };
    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [history, toolMode, lassoPoints]); 

  // --- LÓGICA DE CLICK NA PEÇA (TOGGLE) ---
  const applyPartPaint = (id) => {
    saveToHistory(); 
    setPartColors(prev => {
        const newColors = { ...prev };
        
        // Se a borracha estiver ligada, remove a cor.
        if (isEraser) {
            delete newColors[id];
        }
        // Se a peça já tem essa cor, remove (Toggle).
        else if (newColors[id] === selectedColor) {
            delete newColors[id];
        } 
        // Senão, pinta.
        else {
            newColors[id] = selectedColor;
        }
        return newColors;
    });
  };

  // --- FERRAMENTA 1: PINCEL (MANUAL) ---
  const startBrushDrawing = (e) => {
    if (toolMode !== 'brush') return;
    e.stopPropagation(); 
    setPanningDisabled(true); 
    const pos = getMousePos(e); 
    saveToHistory();
    isDrawingBrush.current = true;
    const ctx = canvasRef.current.getContext('2d');
    
    resetContext(ctx);
    if (isEraser) {
        ctx.globalCompositeOperation = 'destination-out'; // Apagar pixels manuais
        ctx.strokeStyle = 'rgba(0,0,0,1)'; 
    } else {
        ctx.globalCompositeOperation = 'source-over'; // Pintar
        ctx.strokeStyle = selectedColor; 
    }
    ctx.lineCap = 'round'; 
    ctx.lineJoin = 'round';
    ctx.lineWidth = brushSize;
    
    ctx.beginPath();
    ctx.moveTo(pos.x, pos.y);
    ctx.lineTo(pos.x, pos.y);
    ctx.stroke();
  };

  const drawBrush = (e) => {
    const pos = getMousePos(e);
    setCursorPos({ x: pos.x, y: pos.y }); 

    if (!isDrawingBrush.current || toolMode !== 'brush') {
         // Apenas Hover Visual (Guia)
         if (toolMode !== 'select') {
             const found = parts.find(part => pointInPolygon([pos.x, pos.y], part.points));
             setHoveredPartId(found ? found.id : null);
         }
         return;
    }

    const ctx = canvasRef.current.getContext('2d');
    ctx.lineTo(pos.x, pos.y);
    ctx.stroke();
  };

  const stopBrushDrawing = () => {
    if (!isDrawingBrush.current) return;
    isDrawingBrush.current = false;
    const ctx = canvasRef.current.getContext('2d');
    ctx.closePath();
    resetContext(ctx); 
    setPanningDisabled(false);
  };

  // --- FERRAMENTA 2: LAÇO (MANUAL) ---
  const handleCanvasClick = (e) => {
    if (toolMode !== 'lasso') return;
    e.stopPropagation();
    const pos = getMousePos(e);
    setLassoPoints(prev => [...prev, { x: pos.x, y: pos.y }]);
  };

  const finishLassoDrawing = () => {
    if (lassoPoints.length < 3) { alert("Pelo menos 3 pontos necessários."); return; }
    saveToHistory();
    const ctx = canvasRef.current.getContext('2d');
    resetContext(ctx);
    
    if (isEraser) {
        ctx.globalCompositeOperation = 'destination-out';
        ctx.fillStyle = 'rgba(0,0,0,1)'; 
    } else {
        ctx.globalCompositeOperation = 'source-over';
        ctx.fillStyle = selectedColor; 
    }

    ctx.strokeStyle = 'transparent'; 
    ctx.beginPath();
    ctx.moveTo(lassoPoints[0].x, lassoPoints[0].y);
    for (let i = 1; i < lassoPoints.length; i++) { ctx.lineTo(lassoPoints[i].x, lassoPoints[i].y); }
    ctx.closePath();
    ctx.fill(); 
    
    resetContext(ctx); 
    setLassoPoints([]); 
  };

  const handleMouseMoveGlobal = (e) => {
    const pos = getMousePos(e);
    if (toolMode === 'brush') setCursorPos(pos);
    if (toolMode !== 'select') {
        const found = parts.find(part => pointInPolygon([pos.x, pos.y], part.points));
        setHoveredPartId(found ? found.id : null);
    } else {
        setHoveredPartId(null);
    }
  };

  const pointsToSvg = (pts) => pts.map(p => p.join(',')).join(' ');

  const getContainerCursor = () => {
      if (toolMode === 'brush') return 'none'; 
      if (toolMode === 'lasso') return 'default'; 
      return 'grab'; 
  };

  const activateMatteMode = () => {
      setPaintMode('color');
      if(opacity < 0.9) setOpacity(0.95);
  };

  return (
    <div className="app-container">
      <div className="sidebar">
        <div className="sidebar-header">
          <h2>🏎️ Garage AI <span style={{fontSize:10, background:'#e0e7ff', color:'#4f46e5', padding:'2px 6px', borderRadius:4}}>ULTIMATE</span></h2>
        </div>

        <div className="sidebar-content">
          <div className="panel">
            <span className="panel-title">1. Controles</span>
            <label className="btn-upload">📂 Carregar Carro <input type="file" onChange={handleUpload} accept="image/*" /></label>
            <button className="btn-undo" onClick={undoLastAction} disabled={history.length === 0}>↩️ Desfazer (Ctrl+Z)</button>
          </div>

          <div className="panel">
            <span className="panel-title">2. Ferramentas</span>
            <div className="tool-tabs">
                <button className={`tool-tab ${toolMode === 'select' ? 'active' : ''}`} onClick={() => setToolMode('select')}>👆 Seleção</button>
                <button className={`tool-tab ${toolMode === 'brush' ? 'active' : ''}`} onClick={() => setToolMode('brush')}>🖌️ Pincel</button>
                <button className={`tool-tab ${toolMode === 'lasso' ? 'active' : ''}`} onClick={() => setToolMode('lasso')}>📐 Laço</button>
            </div>
            
            <button 
                className={`eraser-btn ${isEraser ? 'active' : ''}`} 
                onClick={() => setIsEraser(!isEraser)}
            >
                {isEraser ? '🧽 Borracha LIGADA' : '🧽 Ativar Borracha'}
            </button>

            {toolMode === 'brush' && (
            <div style={{marginTop: 15, background:'#f3f4f6', padding:10, borderRadius:8}}>
                <div style={{display:'flex', justifyContent:'space-between', fontSize:12, marginBottom:5}}><span>Tamanho</span><span>{brushSize}px</span></div>
                <input type="range" min="1" max="100" value={brushSize} onChange={(e) => setBrushSize(parseInt(e.target.value))} style={{width:'100%'}} />
            </div>
            )}

            {toolMode === 'lasso' && (
                <div style={{marginTop: 15}}>
                    <button className="finish-lasso-btn" onClick={finishLassoDrawing} disabled={lassoPoints.length < 3}>
                        {isEraser ? '❌ Apagar Área' : '✅ Pintar Área'}
                    </button>
                    <p style={{fontSize:11, color:'#999', marginTop:5, textAlign:'center'}}>Pontos: {lassoPoints.length}</p>
                </div>
            )}

            <div style={{marginTop: 15}}>
                <span className="panel-title">Estilo da Pintura</span>
                <div className="tool-tabs" style={{marginTop: 5}}>
                    <button className={`tool-tab ${paintMode === 'normal' ? 'active' : ''}`} onClick={() => setPaintMode('normal')}>Película (Blend)</button>
                    <button className={`tool-tab ${paintMode === 'color' ? 'active' : ''}`} onClick={() => setPaintMode('color')}>Sólida (Fosco)</button>
                </div>
                <button onClick={activateMatteMode} style={{width:'100%', marginTop:5, padding:5, background:'#374151', color:'white', border:'none', borderRadius:4, cursor:'pointer', fontSize:12}}>Ativar Modo Fosco</button>
            </div>

            <div style={{display:'flex', justifyContent:'center', marginTop: 15}}>
              <div style={{opacity: isEraser ? 0.3 : 1, pointerEvents: isEraser ? 'none' : 'auto'}}>
                 <SketchPicker color={selectedColor} onChangeComplete={c => setSelectedColor(c.hex)} disableAlpha={true} width="260px" styles={{default: {picker: {boxShadow: 'none', border: '1px solid #e5e7eb', borderRadius: '8px'}}}} />
              </div>
            </div>
            
            <div style={{marginTop: 16}}>
              <span className="panel-title">Intensidade: {Math.round(opacity * 100)}%</span>
              <div className="slider-container">
                <input type="range" min="0.1" max="1.0" step="0.05" value={opacity} onChange={e => setOpacity(parseFloat(e.target.value))} className="slider-input" />
              </div>
            </div>
          </div>

          {parts.length > 0 && (
            <div>
              <span className="panel-title" style={{marginBottom: 10}}>Peças Automáticas</span>
              <div className="gallery-grid">
                {parts.map(part => (
                  <PartGalleryCard key={part.id} part={part} color={partColors[part.id]} opacity={opacity} onClick={() => applyPartPaint(part.id)} />
                ))}
              </div>
            </div>
          )}
        </div>
      </div>

      <div className="workspace">
        {loading && <div className="loading-overlay"><div className="spinner"></div><h3>Analisando...</h3></div>}

        {!loading && originalImage && (
          <TransformWrapper disabled={panningDisabled} minScale={0.5} maxScale={8} centerOnInit={true}>
            {({ zoomIn, zoomOut, resetTransform }) => (
              <React.Fragment>
                <div className="zoom-controls">
                  <button onClick={() => zoomIn()}>➕</button>
                  <button onClick={() => zoomOut()}>➖</button>
                  <button onClick={() => resetTransform()}>🔄</button>
                </div>

                <TransformComponent wrapperStyle={{width: '100%', height: '100%'}}>
                  <div 
                    className="canvas-container" 
                    onMouseMove={handleMouseMoveGlobal} 
                    style={{ cursor: getContainerCursor(), width: `${imgDims.w}px`, height: `${imgDims.h}px`, position: 'relative', display: 'block' }}
                  >
                    <img src={originalImage} alt="Carro" style={{ width: '100%', height: '100%', display: 'block', pointerEvents: 'none' }} />
                    
                    {toolMode === 'brush' && (
                        <div className="custom-brush-cursor" 
                            style={{ 
                                width: brushSize, height: brushSize, left: cursorPos.x, top: cursorPos.y, 
                                backgroundColor: isEraser ? 'rgba(255,255,255,0.5)' : selectedColor, 
                                border: isEraser ? '2px solid red' : '2px solid white', 
                                boxShadow: '0 0 0 1px black' 
                            }} 
                        />
                    )}

                    <div style={{ position: 'absolute', top: 0, left: 0, width: '100%', height: '100%', opacity: opacity, mixBlendMode: paintMode, pointerEvents: 'none' }}>
                        
                        <canvas
                          ref={canvasRef}
                          width={imgDims.w} height={imgDims.h}
                          onMouseDown={startBrushDrawing} onMouseMove={drawBrush} onMouseUp={stopBrushDrawing} onMouseLeave={stopBrushDrawing}
                          onClick={handleCanvasClick} onDoubleClick={finishLassoDrawing}
                          style={{ position: 'absolute', top: 0, left: 0, width: '100%', height: '100%', pointerEvents: toolMode !== 'select' ? 'auto' : 'none', zIndex: 10, cursor: toolMode === 'brush' ? 'none' : 'default' }}
                        />

                        <svg viewBox={`0 0 ${imgDims.w} ${imgDims.h}`} style={{ position: 'absolute', top: 0, left: 0, width: '100%', height: '100%', zIndex: 20, pointerEvents: toolMode === 'select' ? 'auto' : 'none' }}>
                          {parts.map(part => {
                            const myColor = partColors[part.id];
                            const isHovering = (toolMode !== 'select') && (hoveredPartId === part.id);
                            
                            let strokeColor = 'transparent';
                            let strokeDash = '';
                            let strokeWidth = 0;

                            if (isHovering) {
                                strokeColor = 'rgba(255, 255, 255, 0.8)';
                                strokeDash = '5,5';
                                strokeWidth = 2;
                            }

                            return (
                              <polygon 
                                key={part.id} points={pointsToSvg(part.points)} 
                                fill={myColor || 'white'} fillOpacity={myColor ? 1 : 0}
                                stroke={strokeColor} strokeWidth={strokeWidth} strokeDasharray={strokeDash}
                                style={{ cursor: 'pointer', transition: 'fill-opacity 0.2s', mixBlendMode: 'normal' }} 
                                // AQUI ESTÁ A LÓGICA DE REMOÇÃO DA PEÇA (TOGGLE)
                                onClick={(e) => { 
                                    if(toolMode === 'select' || isEraser) { 
                                        e.stopPropagation(); 
                                        applyPartPaint(part.id); 
                                    }
                                }}
                                onMouseEnter={e => { if(!myColor && toolMode === 'select') { e.target.setAttribute('fill', 'white'); e.target.setAttribute('fill-opacity', '0.4'); }}}
                                onMouseLeave={e => { if(!myColor && toolMode === 'select') { e.target.setAttribute('fill-opacity', '0'); }}}
                              >
                                <title>{part.label}</title>
                              </polygon>
                            );
                          })}
                        </svg>
                    </div>

                    {toolMode === 'lasso' && lassoPoints.length > 0 && (
                        <svg style={{position: 'absolute', top: 0, left: 0, width: '100%', height: '100%', pointerEvents: 'none', zIndex: 30}}>
                            <polyline points={lassoPoints.map(p => `${p.x},${p.y}`).join(' ')} fill="none" stroke={isEraser ? 'red' : 'black'} strokeWidth="2" strokeDasharray="5,5" opacity="0.8"/>
                            {lassoPoints.map((p, i) => (
                                <circle key={i} cx={p.x} cy={p.y} r="3" fill="white" stroke={isEraser ? 'red' : '#4f46e5'} strokeWidth="1"/>
                            ))}
                        </svg>
                    )}
                  </div>
                </TransformComponent>
              </React.Fragment>
            )}
          </TransformWrapper>
        )}
      </div>
    </div>
  );
}

export default App;