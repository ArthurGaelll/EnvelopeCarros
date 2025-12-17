// frontend/src/App.js (Versão "Visual Limpo" - Sem Bordas)
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
  const [loading, setLoading] = useState(false);

  const sortPartsByArea = (partsList) => {
    return [...partsList].sort((a, b) => b.area - a.area);
  };

  const handleUpload = async (e) => {
    const file = e.target.files[0];
    if (!file) return;
    setLoading(true);
    setPartColors({});
    setParts([]);
    setHistory([]);

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

  const pointsToSvg = (pts) => pts.map(p => p.join(',')).join(' ');

  return (
    <div className="app-container">
      {/* SIDEBAR */}
      <div className="sidebar">
        <div className="sidebar-header">
          <h2>🏎️ Garage AI <span style={{fontSize:10, background:'#e0e7ff', color:'#4f46e5', padding:'2px 6px', borderRadius:4}}>YOLO</span></h2>
        </div>

        <div className="sidebar-content">
          <div className="panel">
            <span className="panel-title">1. Projeto</span>
            <label className="btn-upload">
              📂 Carregar Imagem
              <input type="file" onChange={handleUpload} accept="image/*" />
            </label>
            <button className="btn-undo" onClick={undoLastAction} disabled={history.length === 0}>
              ↩️ Desfazer (Ctrl+Z)
            </button>
          </div>

          <div className="panel">
            <span className="panel-title">2. Tinta</span>
            <div style={{display:'flex', justifyContent:'center'}}>
              <SketchPicker
                color={selectedColor}
                onChangeComplete={c => setSelectedColor(c.hex)}
                disableAlpha={true}
                width="260px"
                styles={{default: {picker: {boxShadow: 'none', border: '1px solid #e5e7eb', borderRadius: '8px'}}}}
              />
            </div>
            <div style={{marginTop: 16}}>
              <span className="panel-title">Opacidade: {Math.round(opacity * 100)}%</span>
              <div className="slider-container">
                <input type="range" min="0.1" max="1.0" step="0.1" value={opacity} onChange={e => setOpacity(parseFloat(e.target.value))} className="slider-input" />
              </div>
            </div>
          </div>

          {parts.length > 0 && (
            <div>
              <span className="panel-title" style={{marginBottom: 10}}>Peças ({parts.length})</span>
              <div className="gallery-grid">
                {parts.map(part => (
                  <PartGalleryCard key={part.id} part={part} color={partColors[part.id]} opacity={opacity} onClick={() => applyPaint(part.id, selectedColor)} />
                ))}
              </div>
            </div>
          )}
        </div>
      </div>

      {/* WORKSPACE */}
      <div className="workspace">
        {loading && (
          <div className="loading-overlay">
            <div className="spinner"></div>
            <h3>Detectando com YOLO...</h3>
          </div>
        )}

        {!loading && originalImage && (
          <div className="canvas-container">
            <img src={originalImage} alt="Carro" style={{ display: 'block', maxHeight: '90vh', maxWidth: '100%' }} />

            <svg
              viewBox={`0 0 ${imgDims.w} ${imgDims.h}`}
              style={{ position: 'absolute', top: 0, left: 0, width: '100%', height: '100%' }}
            >
              {parts.map(part => {
                const myColor = partColors[part.id];
                const finalOpacity = myColor ? opacity : 0;

                return (
                  <polygon
                    key={part.id}
                    points={pointsToSvg(part.points)}
                    fill={myColor || 'white'}
                    fillOpacity={finalOpacity}

                    // --- SEM BORDAS ---
                    stroke="transparent" // Sempre transparente
                    strokeWidth={0}      // Espessura zero

                    style={{
                      cursor: 'pointer',
                      transition: 'fill-opacity 0.2s'
                    }}

                    onClick={(e) => { e.stopPropagation(); applyPaint(part.id, selectedColor); }}

                    // Hover: Apenas um brilho branco suave no preenchimento, sem borda.
                    onMouseEnter={e => {
                        if(!myColor) {
                            e.target.setAttribute('fill', 'white');
                            e.target.setAttribute('fill-opacity', '0.15'); // Brilho sutil
                        }
                    }}
                    onMouseLeave={e => {
                        if(!myColor) {
                            e.target.setAttribute('fill-opacity', '0');
                        }
                    }}
                  >
                    <title>{part.label}</title>
                  </polygon>
                );
              })}
            </svg>
          </div>
        )}
      </div>
    </div>
  );
}

export default App;