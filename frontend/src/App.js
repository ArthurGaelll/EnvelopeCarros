// frontend/src/App.js (Versão Estável: Pincel Clássico + Laço Poligonal)
import React, { useState, useEffect, useRef } from 'react';
import axios from 'axios';
import { SketchPicker } from 'react-color';
import './App.css';

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
  
  const [toolMode, setToolMode] = useState('select'); // 'select', 'brush', 'lasso'
  const [brushSize, setBrushSize] = useState(20); 
  const [lassoPoints, setLassoPoints] = useState([]); 

  const [loading, setLoading] = useState(false);
  
  const canvasRef = useRef(null); 
  const isDrawingBrush = useRef(false);

  const sortPartsByArea = (partsList) => {
    return [...partsList].sort((a, b) => b.area - a.area);
  };

  // Função para limpar configurações do Canvas ao trocar de ferramenta
  const resetContext = (ctx) => {
    if (!ctx) return;
    ctx.shadowBlur = 0;
    ctx.shadowColor = 'transparent';
    ctx.globalCompositeOperation = 'source-over';
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

  const applyPartPaint = (id, color) => {
    saveToHistory(); 
    setPartColors(prev => ({ ...prev, [id]: color }));
  };

  // --- FERRAMENTA 1: PINCEL CLÁSSICO (Sólido e Confiável) ---
  const startBrushDrawing = ({ nativeEvent }) => {
    if (toolMode !== 'brush') return;
    const { offsetX, offsetY } = nativeEvent;
    
    saveToHistory();
    isDrawingBrush.current = true;
    
    const ctx = canvasRef.current.getContext('2d');
    resetContext(ctx); // Garante limpeza

    ctx.lineCap = 'round'; 
    ctx.lineJoin = 'round';
    ctx.lineWidth = brushSize;
    ctx.strokeStyle = selectedColor; // Cor direta e sólida
    
    ctx.beginPath();
    ctx.moveTo(offsetX, offsetY);
    ctx.lineTo(offsetX, offsetY);
    ctx.stroke();
  };

  const drawBrush = ({ nativeEvent }) => {
    if (!isDrawingBrush.current || toolMode !== 'brush') return;
    const { offsetX, offsetY } = nativeEvent;
    const ctx = canvasRef.current.getContext('2d');
    
    ctx.lineTo(offsetX, offsetY);
    ctx.stroke();
  };

  const stopBrushDrawing = () => {
    if (!isDrawingBrush.current) return;
    isDrawingBrush.current = false;
    const ctx = canvasRef.current.getContext('2d');
    ctx.closePath();
  };

  // --- FERRAMENTA 2: LAÇO POLIGONAL (Funcional) ---
  const handleCanvasClick = ({ nativeEvent }) => {
    if (toolMode !== 'lasso') return;
    const { offsetX, offsetY } = nativeEvent;
    setLassoPoints(prev => [...prev, { x: offsetX, y: offsetY }]);
  };

  const finishLassoDrawing = () => {
    if (lassoPoints.length < 3) {
        alert("Precisa de pelo menos 3 pontos.");
        return;
    }
    saveToHistory();
    const ctx = canvasRef.current.getContext('2d');
    resetContext(ctx); // Limpa configurações

    ctx.fillStyle = selectedColor; 
    ctx.strokeStyle = 'transparent'; // Sem borda no preenchimento

    ctx.beginPath();
    ctx.moveTo(lassoPoints[0].x, lassoPoints[0].y);
    for (let i = 1; i < lassoPoints.length; i++) {
        ctx.lineTo(lassoPoints[i].x, lassoPoints[i].y);
    }
    ctx.closePath();
    ctx.fill(); // Preenche a forma
    
    setLassoPoints([]); 
  };

  const pointsToSvg = (pts) => pts.map(p => p.join(',')).join(' ');

  const getCursorStyle = () => {
      if (toolMode === 'brush') return 'crosshair';
      if (toolMode === 'lasso') return 'cell';
      return 'default';
  };

  return (
    <div className="app-container">
      <div className="sidebar">
        <div className="sidebar-header">
          <h2>🏎️ Garage AI <span style={{fontSize:10, background:'#e0e7ff', color:'#4f46e5', padding:'2px 6px', borderRadius:4}}>PRO</span></h2>
        </div>

        <div className="sidebar-content">
          <div className="panel">
            <span className="panel-title">1. Controles</span>
            <label className="btn-upload">
              📂 Carregar Carro
              <input type="file" onChange={handleUpload} accept="image/*" />
            </label>
            <button className="btn-undo" onClick={undoLastAction} disabled={history.length === 0}>
              ↩️ Desfazer (Ctrl+Z)
            </button>
          </div>

          <div className="panel">
            <span className="panel-title">2. Ferramentas</span>
            
            <div className="tool-tabs">
                <button className={`tool-tab ${toolMode === 'select' ? 'active' : ''}`} onClick={() => setToolMode('select')}>
                    👆 Seleção
                </button>
                <button className={`tool-tab ${toolMode === 'brush' ? 'active' : ''}`} onClick={() => setToolMode('brush')}>
                    🖌️ Pincel
                </button>
                <button className={`tool-tab ${toolMode === 'lasso' ? 'active' : ''}`} onClick={() => setToolMode('lasso')}>
                    📐 Laço
                </button>
            </div>

            {toolMode === 'brush' && (
               <div style={{marginBottom: 15, background:'#f3f4f6', padding:10, borderRadius:8}}>
                 <div style={{display:'flex', justifyContent:'space-between', fontSize:12, marginBottom:5}}><span>Tamanho</span><span>{brushSize}px</span></div>
                 <input type="range" min="1" max="100" value={brushSize} onChange={(e) => setBrushSize(parseInt(e.target.value))} style={{width:'100%'}} />
               </div>
            )}

            {toolMode === 'lasso' && (
                <div style={{marginBottom: 15}}>
                    <p style={{fontSize:12, color:'#666', margin:'0 0 10px 0'}}>Clique para criar pontos.</p>
                    <button className="finish-lasso-btn" onClick={finishLassoDrawing} disabled={lassoPoints.length < 3}>
                        ✅ Fechar Polígono
                    </button>
                     <p style={{fontSize:11, color:'#999', marginTop:5, textAlign:'center'}}>Pontos: {lassoPoints.length}</p>
                </div>
            )}

            <div style={{display:'flex', justifyContent:'center', marginTop: 15}}>
              <SketchPicker 
                color={selectedColor} onChangeComplete={c => setSelectedColor(c.hex)} disableAlpha={true} width="260px"
                styles={{default: {picker: {boxShadow: 'none', border: '1px solid #e5e7eb', borderRadius: '8px'}}}}
              />
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
                  <PartGalleryCard key={part.id} part={part} color={partColors[part.id]} opacity={opacity} onClick={() => applyPartPaint(part.id, selectedColor)} />
                ))}
              </div>
            </div>
          )}
        </div>
      </div>

      <div className="workspace">
        {loading && <div className="loading-overlay"><div className="spinner"></div><h3>Analisando Veículo...</h3></div>}

        {!loading && originalImage && (
          <div className="canvas-container">
            <img src={originalImage} alt="Carro" style={{ display: 'block', maxHeight: '90vh', maxWidth: '100%', pointerEvents: 'none' }} />

            {/* Wrapper Global de Opacidade */}
            <div style={{
                position: 'absolute', top: 0, left: 0, width: '100%', height: '100%',
                opacity: opacity, pointerEvents: 'none'
            }}>
                
                {/* CAMADA DE PINTURA (Pincel + Laço) */}
                <canvas
                  ref={canvasRef}
                  width={imgDims.w} height={imgDims.h}
                  onMouseDown={startBrushDrawing}
                  onMouseMove={drawBrush}
                  onMouseUp={stopBrushDrawing}
                  onMouseLeave={stopBrushDrawing}
                  onClick={handleCanvasClick}
                  onDoubleClick={finishLassoDrawing}
                  style={{
                    position: 'absolute', top: 0, left: 0, width: '100%', height: '100%',
                    pointerEvents: toolMode !== 'select' ? 'auto' : 'none', 
                    cursor: getCursorStyle(),
                    zIndex: 10
                  }}
                />

                {/* CAMADA YOLO (SVG) */}
                <svg 
                  viewBox={`0 0 ${imgDims.w} ${imgDims.h}`} 
                  style={{ 
                    position: 'absolute', top: 0, left: 0, width: '100%', height: '100%', 
                    zIndex: 20,
                    pointerEvents: toolMode === 'select' ? 'auto' : 'none'
                  }}
                >
                  {parts.map(part => {
                    const myColor = partColors[part.id];
                    return (
                      <polygon 
                        key={part.id} points={pointsToSvg(part.points)} 
                        fill={myColor || 'white'} fillOpacity={myColor ? 1 : 0}
                        stroke="transparent" strokeWidth={0} 
                        style={{ cursor: 'pointer', transition: 'fill-opacity 0.2s', mixBlendMode: 'normal' }} 
                        onClick={(e) => { if(toolMode === 'select') { e.stopPropagation(); applyPartPaint(part.id, selectedColor); }}}
                        onMouseEnter={e => { if(!myColor && toolMode === 'select') { e.target.setAttribute('fill', 'white'); e.target.setAttribute('fill-opacity', '0.4'); }}}
                        onMouseLeave={e => { if(!myColor && toolMode === 'select') { e.target.setAttribute('fill-opacity', '0'); }}}
                      >
                        <title>{part.label}</title>
                      </polygon>
                    );
                  })}
                </svg>
            </div>

            {/* Visualização das Linhas do Laço */}
            {toolMode === 'lasso' && lassoPoints.length > 0 && (
                <svg style={{position: 'absolute', top: 0, left: 0, width: '100%', height: '100%', pointerEvents: 'none', zIndex: 30}}>
                    <polyline points={lassoPoints.map(p => `${p.x},${p.y}`).join(' ')} fill="none" stroke="black" strokeWidth="3" strokeDasharray="5,5" opacity="0.5"/>
                    <polyline points={lassoPoints.map(p => `${p.x},${p.y}`).join(' ')} fill="none" stroke="white" strokeWidth="1.5" strokeDasharray="5,5"/>
                    {lassoPoints.map((p, i) => (
                        <circle key={i} cx={p.x} cy={p.y} r="3" fill="white" stroke="#4f46e5" strokeWidth="1"/>
                    ))}
                </svg>
            )}

          </div>
        )}
      </div>
    </div>
  );
}

export default App;