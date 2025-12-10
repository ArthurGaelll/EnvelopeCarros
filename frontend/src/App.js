// frontend/src/App.js
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
      <div className="part-label">
        {part.id.toString().startsWith('yolo') ? '🔒 ' : '✏️ '}{part.label}
      </div>
    </div>
  );
};

function App() {
  const [originalImage, setOriginalImage] = useState(null);
  const [imageFile, setImageFile] = useState(null);
  const [imgDims, setImgDims] = useState({ w: 0, h: 0 });
  const [parts, setParts] = useState([]);
  const [partColors, setPartColors] = useState({});
  const [history, setHistory] = useState([]);
  // NOVO: Guarda os limites do carro (retângulo Bounding Box)
  const [carBounds, setCarBounds] = useState(null);

  const [selectedColor, setSelectedColor] = useState('#4f46e5');
  const [opacity, setOpacity] = useState(0.7);
  const [loading, setLoading] = useState(false);
  const [processingClick, setProcessingClick] = useState(false);

  const svgRef = useRef(null);

  const sortPartsByArea = (partsList) => {
    return [...partsList].sort((a, b) => b.area - a.area);
  };

  const handleUpload = async (e) => {
    const file = e.target.files[0];
    if (!file) return;
    setLoading(true);
    setImageFile(file);
    setPartColors({});
    setParts([]);
    setHistory([]);
    setCarBounds(null); // Reseta limites

    const formData = new FormData();
    formData.append('image', file);

    try {
      const res = await axios.post('http://localhost:8000/analyze_car', formData);
      setOriginalImage(res.data.original);
      setImgDims({ w: res.data.width, h: res.data.height });
      setParts(sortPartsByArea(res.data.parts));
      // Salva os limites recebidos do backend
      setCarBounds(res.data.bounds);
      console.log("Limites do carro:", res.data.bounds);
    } catch (err) {
      alert("Erro ao conectar com o backend.");
    } finally {
      setLoading(false);
    }
  };

  const applyPaint = (id, color) => {
    setHistory(prev => [...prev, partColors]);
    setPartColors(prev => ({ ...prev, [id]: color }));
  };

  const undoLastAction = () => {
    if (history.length === 0) return;
    const previousState = history[history.length - 1];
    setPartColors(previousState);
    setHistory(prev => prev.slice(0, -1));
  };

  useEffect(() => {
    const handleKeyDown = (e) => {
      if ((e.ctrlKey || e.metaKey) && e.key === 'z') undoLastAction();
    };
    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [history]);

  const handlePolygonClick = (id, e) => {
    e.stopPropagation();
    if (id.toString().startsWith('yolo')) return;
    applyPaint(id, selectedColor);
  };

  // --- CLIQUE NO VAZIO (COM TRAVA DE SEGURANÇA) ---
  const handleBackgroundClick = async (e) => {
    if (!imageFile || processingClick || !carBounds) return;

    const svgRect = svgRef.current.getBoundingClientRect();
    const scaleX = imgDims.w / svgRect.width;
    const scaleY = imgDims.h / svgRect.height;
    const realX = Math.round((e.clientX - svgRect.left) * scaleX);
    const realY = Math.round((e.clientY - svgRect.top) * scaleY);

    // --- TRAVA DE SEGURANÇA ---
    // Verifica se o clique está dentro do retângulo do carro
    if (
        realX < carBounds.minX || realX > carBounds.maxX ||
        realY < carBounds.minY || realY > carBounds.maxY
    ) {
        console.log("Clique fora dos limites do carro. Ignorando.");
        // Opcional: Mostrar um toast/aviso rápido
        return;
    }

    setProcessingClick(true);
    const formData = new FormData();
    formData.append('image', imageFile);
    formData.append('click_x', realX);
    formData.append('click_y', realY);

    try {
      const res = await axios.post('http://localhost:8000/segment_from_click', formData);
      const newPart = res.data;
      setParts(prev => sortPartsByArea([...prev, newPart]));
      applyPaint(newPart.id, selectedColor);
    } catch (err) {
      console.log("Nada encontrado.");
    } finally {
      setProcessingClick(false);
    }
  };

  const pointsToSvg = (pts) => pts.map(p => p.join(',')).join(' ');

  return (
    <div className="app-container">
      {/* ... SIDEBAR (código igual ao anterior) ... */}
      <div className="sidebar">
        <div className="sidebar-header">
          <h2>🏎️ Garage AI <span style={{fontSize:10, background:'#e0e7ff', color:'#4f46e5', padding:'2px 6px', borderRadius:4}}>PRO</span></h2>
        </div>
        <div className="sidebar-content">
          <div className="panel">
            <span className="panel-title">1. Projeto</span>
            <label className="btn-upload">
              📂 Escolher Imagem do Carro
              <input type="file" onChange={handleUpload} accept="image/*" />
            </label>
            <button className="btn-undo" onClick={undoLastAction} disabled={history.length === 0}>
              ↩️ Desfazer (Ctrl+Z)
            </button>
          </div>
          <div className="panel">
            <span className="panel-title">2. Estúdio de Pintura</span>
            <div style={{display:'flex', justifyContent:'center'}}>
              <SketchPicker color={selectedColor} onChangeComplete={c => setSelectedColor(c.hex)} disableAlpha={true} width="260px" styles={{default: {picker: {boxShadow: 'none', border: '1px solid #e5e7eb', borderRadius: '8px'}}}} />
            </div>
            <div style={{marginTop: 16}}>
              <span className="panel-title" style={{marginBottom:4}}>Intensidade da Tinta</span>
              <div className="slider-container">
                <input type="range" min="0.1" max="1.0" step="0.1" value={opacity} onChange={e => setOpacity(parseFloat(e.target.value))} className="slider-input" />
                <span className="opacity-value">{Math.round(opacity * 100)}%</span>
              </div>
            </div>
          </div>
          {parts.length > 0 && (
            <div>
              <span className="panel-title" style={{marginBottom: 10}}>Peças Identificadas ({parts.length})</span>
              <div className="gallery-grid">
                {parts.map(part => (
                  <PartGalleryCard key={part.id} part={part} color={partColors[part.id]} opacity={opacity} onClick={() => applyPaint(part.id, selectedColor)} />
                ))}
              </div>
            </div>
          )}
        </div>
      </div>

      {/* --- WORKSPACE --- */}
      <div className="workspace">
        {loading && (
          <div className="loading-overlay">
            <div className="spinner"></div>
            <h3>Escaneando Veículo...</h3>
          </div>
        )}
        {!originalImage && !loading && (
          <div style={{textAlign:'center', color: '#6b7280'}}>
            <div style={{fontSize: 60, marginBottom: 20}}>📷</div>
            <h2>Nenhum veículo carregado</h2>
          </div>
        )}
        {!loading && originalImage && (
          <div className="canvas-container">
            <img src={originalImage} alt="Carro" style={{ display: 'block', maxHeight: '90vh', maxWidth: '100%' }} />

            <svg
              ref={svgRef}
              viewBox={`0 0 ${imgDims.w} ${imgDims.h}`}
              style={{ position: 'absolute', top: 0, left: 0, width: '100%', height: '100%', cursor: processingClick ? 'wait' : 'crosshair' }}
              onClick={handleBackgroundClick}
            >
              {parts.map(part => {
                const myColor = partColors[part.id];
                const isYolo = part.id.toString().startsWith('yolo');
                const finalOpacity = myColor ? opacity : 0;

                // --- CORREÇÃO VISUAL: BORDAS LIMPAS ---
                // Se tem cor -> Borda branca forte.
                // Se NÃO tem cor -> Borda transparente (invisível).
                // O hover se encarrega de mostrar onde a peça está.
                const strokeColor = myColor ? 'rgba(255,255,255,0.9)' : 'transparent';

                return (
                  <polygon
                    key={part.id}
                    points={pointsToSvg(part.points)}
                    fill={myColor || 'white'}
                    fillOpacity={finalOpacity}
                    stroke={strokeColor}
                    strokeWidth={isYolo ? 1 : 2}
                    className="polygon-shape"
                    style={{
                      cursor: isYolo ? 'not-allowed' : 'pointer',
                      transition: 'all 0.2s'
                    }}
                    onClick={(e) => handlePolygonClick(part.id, e)}

                    // Efeito Hover para mostrar peças não pintadas
                    onMouseEnter={e => {
                        if(!myColor) {
                            e.target.setAttribute('fill', 'white');
                            e.target.setAttribute('fill-opacity', '0.3');
                            // Cor da borda no hover dependendo do tipo
                            e.target.setAttribute('stroke', isYolo ? 'rgba(79, 70, 229, 0.5)' : 'rgba(245, 158, 11, 0.8)');
                        }
                    }}
                    onMouseLeave={e => {
                        if(!myColor) {
                            e.target.setAttribute('fill-opacity', '0');
                            e.target.setAttribute('stroke', 'transparent');
                        }
                    }}
                  >
                    <title>{part.label}</title>
                  </polygon>
                );
              })}
            </svg>

            {processingClick && (
              <div className="toast">🔨 Criando peça manual...</div>
            )}
          </div>
        )}
      </div>
    </div>
  );
}

export default App;