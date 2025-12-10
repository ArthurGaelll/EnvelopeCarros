// frontend/src/App.js (Versão Visual Otimizada)
import React, { useState, useEffect, useRef } from 'react';
import axios from 'axios';
import { SketchPicker } from 'react-color';

// --- CARD DA GALERIA ---
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
      
      // 1. Limpa
      ctx.clearRect(0, 0, canvas.width, canvas.height);
      
      // 2. Desenha Imagem
      ctx.drawImage(img, 0, 0);

      // 3. Aplica Tinta (Se tiver cor)
      if (color) {
        ctx.globalCompositeOperation = 'source-atop';
        ctx.fillStyle = color;
        ctx.globalAlpha = opacity;
        ctx.fillRect(0, 0, canvas.width, canvas.height);
        
        // Reseta
        ctx.globalCompositeOperation = 'source-over';
        ctx.globalAlpha = 1.0;
      }
    };
  }, [part.image, color, opacity]);

  // Visual do Card: Borda colorida se pintado, cinza se não
  const borderStyle = color 
    ? `3px solid ${color}` 
    : '1px solid #ddd';

  return (
    <div onClick={onClick} style={{ 
        border: borderStyle,
        borderRadius: 8, margin: 5, padding: 5, 
        cursor: 'pointer', background: '#fff', 
        width: 110, textAlign: 'center',
        boxShadow: color ? '0 0 5px rgba(0,0,0,0.2)' : 'none'
      }}>
      <canvas ref={canvasRef} style={{maxWidth: '100%', height: 'auto'}} />
      <div style={{fontSize: 11, marginTop: 4, fontWeight: 'bold', color: '#555'}}>
        {part.id.toString().startsWith('yolo') ? '🔒 ' : '✏️ '}{part.label}
      </div>
    </div>
  );
};

// --- APP PRINCIPAL ---
function App() {
  const [originalImage, setOriginalImage] = useState(null);
  const [imageFile, setImageFile] = useState(null);
  const [imgDims, setImgDims] = useState({ w: 0, h: 0 });
  
  const [parts, setParts] = useState([]); 
  const [partColors, setPartColors] = useState({}); 
  
  const [selectedColor, setSelectedColor] = useState('#FF0000');
  const [opacity, setOpacity] = useState(0.6);
  const [loading, setLoading] = useState(false);
  const [processingClick, setProcessingClick] = useState(false);

  const svgRef = useRef(null);

  // Upload
  const handleUpload = async (e) => {
    const file = e.target.files[0];
    if (!file) return;
    setLoading(true);
    setImageFile(file);
    setPartColors({});
    setParts([]);
    
    const formData = new FormData();
    formData.append('image', file);

    try {
      const res = await axios.post('http://localhost:8000/analyze_car', formData);
      setOriginalImage(res.data.original);
      setImgDims({ w: res.data.width, h: res.data.height });
      setParts(res.data.parts);
    } catch (err) {
      alert("Erro ao conectar com o backend.");
    } finally {
      setLoading(false);
    }
  };

  // Pintar pela Galeria (SEMPRE PERMITIDO)
  const paintPartFromGallery = (id) => {
    setPartColors(prev => ({ ...prev, [id]: selectedColor }));
  };

  // Clique na Imagem (COM REGRAS DE TRAVA)
  const handlePolygonClick = (id, e) => {
    e.stopPropagation(); // Não deixa clicar no fundo

    // 1. Se for Automático (YOLO) -> BLOQUEIA
    if (id.toString().startsWith('yolo')) {
        console.log("🚫 Bloqueado: Use a galeria para pintar peças automáticas.");
        return; 
    }

    // 2. Se for Manual -> PINTA
    setPartColors(prev => ({ ...prev, [id]: selectedColor }));
  };

  // Clique no Vazio (CRIAR NOVA PEÇA)
  const handleBackgroundClick = async (e) => {
    if (!imageFile || processingClick) return;

    // Matemática de Coordenadas (Tela -> Imagem Real)
    const svgRect = svgRef.current.getBoundingClientRect();
    const clickX = e.clientX - svgRect.left;
    const clickY = e.clientY - svgRect.top;
    const scaleX = imgDims.w / svgRect.width;
    const scaleY = imgDims.h / svgRect.height;
    const realX = Math.round(clickX * scaleX);
    const realY = Math.round(clickY * scaleY);

    setProcessingClick(true);
    const formData = new FormData();
    formData.append('image', imageFile);
    formData.append('click_x', realX);
    formData.append('click_y', realY);

    try {
      const res = await axios.post('http://localhost:8000/segment_from_click', formData);
      const newPart = res.data;
      setParts(prev => [...prev, newPart]);
      // Já nasce pintado
      setPartColors(prev => ({ ...prev, [newPart.id]: selectedColor }));
    } catch (err) {
      console.log("Nenhuma peça detectada neste ponto.");
    } finally {
      setProcessingClick(false);
    }
  };

  const pointsToSvg = (pts) => pts.map(p => p.join(',')).join(' ');

  return (
    <div style={{ display: 'flex', height: '100vh', fontFamily: 'Segoe UI, sans-serif' }}>
      
      {/* --- MENU ESQUERDO --- */}
      <div style={{ width: 340, background: '#f8f9fa', borderRight: '1px solid #ddd', display:'flex', flexDirection:'column' }}>
        <div style={{padding: 20, borderBottom: '1px solid #ddd', background: 'white'}}>
            <h2 style={{margin:0, color: '#333'}}>🚘 Oficina 2.0</h2>
            <p style={{margin:'5px 0 0 0', fontSize:12, color:'#666'}}>Clique no carro para criar correções.</p>
        </div>
        
        <div style={{padding: 20, overflowY: 'auto', flex: 1}}>
            {/* Seção Arquivo */}
            <div style={{marginBottom: 20}}>
                <label style={{fontWeight:'bold', display:'block', marginBottom:5}}>Imagem do Veículo</label>
                <input type="file" onChange={handleUpload} style={{width:'100%'}} />
            </div>

            {/* Seção Cor */}
            <div style={{marginBottom: 20, background:'white', padding:10, borderRadius:8, border:'1px solid #eee'}}>
                <label style={{fontWeight:'bold', display:'block', marginBottom:10}}>Mistura de Tinta</label>
                <SketchPicker 
                    color={selectedColor} 
                    onChangeComplete={c => setSelectedColor(c.hex)} 
                    disableAlpha={true} 
                    width="100%"
                    presetColors={['#D0021B', '#F5A623', '#F8E71C', '#8B572A', '#7ED321', '#417505', '#BD10E0', '#9013FE', '#4A90E2', '#50E3C2', '#B8E986', '#000000', '#4A4A4A', '#9B9B9B', '#FFFFFF']}
                />
                <div style={{marginTop: 15}}>
                    <div style={{display:'flex', justifyContent:'space-between', marginBottom:5, fontSize:12}}>
                        <span>Transparência</span>
                        <span>{Math.round(opacity * 100)}%</span>
                    </div>
                    <input 
                        type="range" min="0.1" max="1.0" step="0.1" 
                        value={opacity} 
                        onChange={e => setOpacity(parseFloat(e.target.value))} 
                        style={{width:'100%', cursor:'pointer'}}
                    />
                </div>
            </div>

            {/* Galeria */}
            {parts.length > 0 && (
              <div>
                <h4 style={{marginBottom:10}}>Peças Detectadas ({parts.length})</h4>
                <div style={{display: 'flex', flexWrap: 'wrap', gap: 5}}>
                  {parts.map(part => (
                    <PartGalleryCard 
                        key={part.id} 
                        part={part} 
                        color={partColors[part.id]} 
                        opacity={opacity} 
                        onClick={() => paintPartFromGallery(part.id)} 
                    />
                  ))}
                </div>
              </div>
            )}
        </div>
      </div>

      {/* --- ÁREA DE TRABALHO (DIREITA) --- */}
      <div style={{ flex: 1, background: '#2c3e50', display: 'flex', justifyContent: 'center', alignItems: 'center', position: 'relative', overflow: 'hidden' }}>
        
        {loading && (
            <div style={{color:'white', textAlign:'center'}}>
                <div style={{fontSize: 40, marginBottom:10}}>⚙️</div>
                <div>Escaneando geometria do carro...</div>
            </div>
        )}
        
        {!loading && originalImage && (
          <div style={{ position: 'relative', boxShadow: '0 20px 50px rgba(0,0,0,0.5)', borderRadius: 4, overflow:'hidden' }}>
            
            {/* Imagem Base */}
            <img src={originalImage} alt="Carro" style={{ display: 'block', maxHeight: '90vh', maxWidth: '100%' }} />

            {/* Camada SVG (Pintura) */}
            <svg 
              ref={svgRef}
              viewBox={`0 0 ${imgDims.w} ${imgDims.h}`} 
              style={{ position: 'absolute', top: 0, left: 0, width: '100%', height: '100%', cursor: processingClick ? 'wait' : 'crosshair' }}
              onClick={handleBackgroundClick}
            >
              {parts.map(part => {
                const myColor = partColors[part.id]; // Cor selecionada (Hex)
                const isYolo = part.id.toString().startsWith('yolo');

                // --- CORREÇÃO DA PINTURA ---
                // Usamos fillOpacity nativo do SVG. Se tiver cor, usa a opacidade global. Se não, 0 (invisível).
                const finalOpacity = myColor ? opacity : 0; 
                
                // Borda:
                // Se pintado: Branca (para destacar a cor)
                // Se não pintado + YOLO: Verde clarinho (para saber que existe)
                // Se não pintado + Manual: Amarelo (para saber que existe)
                let strokeColor = 'transparent';
                if (myColor) strokeColor = 'rgba(255,255,255,0.8)';
                else if (isYolo) strokeColor = 'rgba(0,255,0,0.3)';
                else strokeColor = 'rgba(255,255,0,0.6)';

                return (
                  <polygon 
                    key={part.id} 
                    points={pointsToSvg(part.points)} 
                    
                    // AQUI ESTÁ A MÁGICA DO PREENCHIMENTO:
                    fill={myColor || 'white'} 
                    fillOpacity={finalOpacity}
                    
                    stroke={strokeColor} 
                    strokeWidth={isYolo ? 1 : 2} 
                    
                    // Cursor muda para "Proibido" se for peça automática
                    style={{ cursor: isYolo ? 'not-allowed' : 'pointer', transition: 'fill-opacity 0.2s' }} 
                    
                    onClick={(e) => handlePolygonClick(part.id, e)}
                    
                    // Hover Effect (Apenas visual, sem pintar)
                    onMouseEnter={e => { 
                        if(!myColor && !isYolo) { // Só brilha se for manual e sem tinta
                            e.target.setAttribute('fill', 'white');
                            e.target.setAttribute('fill-opacity', '0.3');
                        }
                    }}
                    onMouseLeave={e => { 
                        if(!myColor && !isYolo) {
                            e.target.setAttribute('fill-opacity', '0');
                        }
                    }}
                  >
                    <title>{part.label} {isYolo ? '(Automático - Bloqueado)' : '(Manual - Editável)'}</title>
                  </polygon>
                );
              })}
            </svg>
            
            {processingClick && (
                <div style={{position:'absolute', top:20, right:20, background:'rgba(0,0,0,0.8)', color:'white', padding:'8px 15px', borderRadius:20, fontSize:14, display:'flex', alignItems:'center', gap:10}}>
                    <div className="spinner" style={{width:10, height:10, borderRadius:'50%', border:'2px solid white', borderTopColor:'transparent', animation:'spin 1s linear infinite'}}></div>
                    Criando peça nova...
                </div>
            )}
            <style>{`@keyframes spin { 0% { transform: rotate(0deg); } 100% { transform: rotate(360deg); } }`}</style>
          </div>
        )}
      </div>
    </div>
  );
}

export default App;