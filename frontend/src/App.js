// frontend/src/App.js
import React, { useState, useRef } from 'react';
import axios from 'axios';
import { SketchPicker } from 'react-color';
import './App.css'; // Você pode criar um CSS básico para centralizar as coisas

function App() {
  const [image, setImage] = useState(null); // A imagem atual exibida (URL blob)
  const [imageFile, setImageFile] = useState(null); // O arquivo da imagem atual (para enviar ao backend)
  const [color, setColor] = useState('#00A2FF');
  const [opacity, setOpacity] = useState(0.6);
  const [isLoading, setIsLoading] = useState(false);
  const imageRef = useRef(null);

  // 1. Upload da imagem inicial
  const handleImageUpload = (event) => {
    const file = event.target.files[0];
    if (file) {
      setImage(URL.createObjectURL(file));
      setImageFile(file);
    }
  };

  // 2. Lidar com o clique na imagem
  const handleImageClick = async (event) => {
    if (!imageRef.current || isLoading || !imageFile) return;

    setIsLoading(true);

    // --- MÁGICA PARA DESCOBRIR A COORDENADA REAL ---
    // A imagem na tela pode estar redimensionada pelo CSS. 
    // Precisamos traduzir o clique na tela para o pixel real da imagem original.
    const rect = imageRef.current.getBoundingClientRect();
    const x_screen = event.clientX - rect.left; // X onde clicou na tela
    const y_screen = event.clientY - rect.top;  // Y onde clicou na tela

    const DisplayWidth = imageRef.current.clientWidth;
    const DisplayHeight = imageRef.current.clientHeight;
    const NaturalWidth = imageRef.current.naturalWidth; // Tamanho real da imagem
    const NaturalHeight = imageRef.current.naturalHeight;

    const ratioX = NaturalWidth / DisplayWidth;
    const ratioY = NaturalHeight / DisplayHeight;

    const finalX = Math.round(x_screen * ratioX);
    const finalY = Math.round(y_screen * ratioY);
    // --------------------------------------------------

    console.log(`Clicou em: X=${finalX}, Y=${finalY}`);

    // 3. Preparar dados para enviar ao Python
    const formData = new FormData();
    // Enviamos a imagem ATUAL (que já pode estar pintada) para acumular pinturas
    formData.append('image', imageFile); 
    formData.append('click_x', finalX);
    formData.append('click_y', finalY);
    formData.append('color_hex', color);
    formData.append('opacity', opacity);

    try {
      // Enviar para o backend FastAPI
      const response = await axios.post('http://localhost:8000/process_click', formData, {
        responseType: 'blob', // Esperamos uma imagem de volta
      });

      // Atualizar a imagem na tela com o resultado
      const newImageUrl = URL.createObjectURL(response.data);
      setImage(newImageUrl);
      // Atualizar o "arquivo" atual para o próximo clique ser sobre essa nova imagem
      setImageFile(new File([response.data], "processed_image.jpg", { type: "image/jpeg" }));

    } catch (error) {
      console.error("Erro ao processar clique:", error);
      alert("Erro ao se comunicar com o backend Python.");
    } finally {
      setIsLoading(false);
    }
  };

  return (
    <div className="App" style={{ padding: '20px', fontFamily: 'Arial' }}>
      <h1>🏎️ Envelopamento com GPU Local</h1>

      <div style={{ marginBottom: '20px' }}>
        <input type="file" accept="image/*" onChange={handleImageUpload} />
      </div>

      <div style={{ display: 'flex', gap: '20px' }}>
        {/* Área da Imagem */}
        <div style={{ position: 'relative', border: '2px solid #ccc', maxWidth: '800px' }}>
          {image && (
            <img
              ref={imageRef}
              src={image}
              alt="Carro para envelopar"
              onClick={handleImageClick}
              style={{ 
                maxWidth: '100%', 
                height: 'auto', 
                display: 'block', 
                cursor: isLoading ? 'wait' : 'crosshair' 
              }}
            />
          )}
          {isLoading && <div style={{position: 'absolute', top: '50%', left: '50%', transform: 'translate(-50%, -50%)', background: 'rgba(0,0,0,0.7)', color: 'white', padding: '10px'}}>Processando na GPU...</div>}
          {!image && <p style={{padding: '50px'}}>Faça upload de uma imagem para começar.</p>}
        </div>

        {/* Controles Laterais */}
        <div>
          <h3>Controles</h3>
          <SketchPicker color={color} onChangeComplete={(c) => setColor(c.hex)} disableAlpha={true} />
          
          <div style={{ marginTop: '20px' }}>
            <label>Opacidade: {opacity}</label>
            <br />
            <input 
              type="range" 
              min="0.1" 
              max="1.0" 
              step="0.1" 
              value={opacity} 
              onChange={(e) => setOpacity(parseFloat(e.target.value))} 
            />
          </div>
          <p><small>Clique na peça do carro para aplicar a cor selecionada.</small></p>
        </div>
      </div>
    </div>
  );
}

export default App;
