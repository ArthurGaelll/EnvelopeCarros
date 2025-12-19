# YL backend/main.py (Versão "Pure YOLO" - Sem SAM)
from fastapi import FastAPI, File, UploadFile, Form
from fastapi.responses import JSONResponse
from fastapi.middleware.cors import CORSMiddleware
import cv2
import numpy as np
import base64
from ultralytics import YOLO

# --- CONFIGURAÇÃO ---
# Certifique-se de que este modelo foi treinado para SEGMENTAÇÃO (ex: yolov8n-seg.pt)
# Se for um modelo apenas de detecção (bounding box), isso vai dar erro.
YOUR_YOLO_MODEL = "best.pt" 

app = FastAPI()

app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

print("⚙️ Carregando YOLO (Modo Solo)...")
try:
    # Carregamos o modelo. A tarefa 'segment' é importante.
    yolo_model = YOLO(YOUR_YOLO_MODEL) 
    print(f"✅ YOLO carregado com sucesso!")
except Exception as e:
    print(f"❌ Erro ao carregar YOLO: {e}")
    exit(1)

# --- FUNÇÕES AUXILIARES ---
def encode_to_base64(img):
    success, buffer = cv2.imencode('.png', img)
    if not success: return ""
    return base64.b64encode(buffer).decode('utf-8')

def resize_image(image, max_size=1024):
    h, w = image.shape[:2]
    if max(h, w) > max_size:
        scale = max_size / max(h, w)
        new_w, new_h = int(w * scale), int(h * scale)
        return cv2.resize(image, (new_w, new_h))
    return image

@app.post("/analyze_car")
async def analyze_car(image: UploadFile = File(...)):
    print("\n🚀 Analisando carro com PURE YOLO...")
    try:
        contents = await image.read()
        nparr = np.frombuffer(contents, np.uint8)
        original_img = cv2.imdecode(nparr, cv2.IMREAD_COLOR)
        if original_img is None: return JSONResponse({"error": "Erro img"}, 400)

        # Redimensiona para economizar processamento
        original_img = resize_image(original_img)
        h, w = original_img.shape[:2]

        # Roda o YOLO (garantindo que retorna máscaras com retina_masks=True para qualidade)
        results = yolo_model(original_img, retina_masks=True, verbose=False)[0]

        parts_data = []
        
        # Variáveis para calcular os limites do carro (Bounds)
        min_x, min_y, max_x, max_y = w, h, 0, 0
        found_any = False

        # Verifica se o modelo detectou algo E se tem máscaras (Segmentação)
        if results.masks is not None:
            # Itera sobre máscaras e caixas simultaneamente
            for i, (mask, box) in enumerate(zip(results.masks, results.boxes)):
                try:
                    # 1. Dados Básicos
                    cls_id = int(box.cls)
                    label = results.names[cls_id]
                    
                    # 2. Polígono (YOLO v8 já entrega os pontos xy prontos!)
                    # mask.xy é uma lista de arrays, pegamos o primeiro
                    polygon_points = mask.xy[0].astype(int).tolist()
                    
                    if len(polygon_points) < 3: continue

                    # 3. Cálculo de Área (usando OpenCV no polígono)
                    # Precisamos converter para numpy array int32 para o OpenCV ler
                    pts_np = np.array(polygon_points, np.int32)
                    area = cv2.contourArea(pts_np)

                    # 4. Atualizar Limites do Carro
                    found_any = True
                    x_coords = [p[0] for p in polygon_points]
                    y_coords = [p[1] for p in polygon_points]
                    min_x = min(min_x, min(x_coords))
                    min_y = min(min_y, min(y_coords))
                    max_x = max(max_x, max(x_coords))
                    max_y = max(max_y, max(y_coords))

                    # 5. Criar Recorte (Crop) Transparente
                    # Como não temos o SAM para dar a máscara binária, criamos a partir do polígono
                    mask_img = np.zeros((h, w), dtype=np.uint8)
                    cv2.fillPoly(mask_img, [pts_np], 255) # Preenche o polígono de branco

                    img_rgba = cv2.cvtColor(original_img, cv2.COLOR_BGR2BGRA)
                    img_rgba[:, :, 3] = mask_img # Aplica transparência

                    # Corta o retângulo exato (Bounding Box da máscara)
                    y1, y2, x1, x2 = min(y_coords), max(y_coords), min(x_coords), max(x_coords)
                    
                    # Margem de segurança para não quebrar o slice
                    y1, x1 = max(0, y1), max(0, x1)
                    y2, x2 = min(h, y2), min(w, x2)

                    cropped = img_rgba[y1:y2, x1:x2]
                    b64_crop = encode_to_base64(cropped)

                    parts_data.append({
                        "id": f"yolo_{i}",
                        "label": label,
                        "points": polygon_points,
                        "area": area,
                        "image": f"data:image/png;base64,{b64_crop}"
                    })

                except Exception as e_part:
                    print(f"⚠️ Erro ao processar peça {i}: {e_part}")
                    continue
        else:
            print("⚠️ AVISO: O modelo não retornou máscaras. Verifique se é um modelo '-seg'.")

        if not found_any:
            min_x, min_y, max_x, max_y = 0, 0, 0, 0

        original_b64 = encode_to_base64(original_img)
        
        return JSONResponse({
            "width": w, "height": h,
            "bounds": {"minX": min_x, "minY": min_y, "maxX": max_x, "maxY": max_y},
            "original": f"data:image/png;base64,{original_b64}",
            "parts": parts_data
        })

    except Exception as e:
        print(f"🔥 Erro Crítico: {e}")
        return JSONResponse({"error": str(e)}, 500)


# --- ENDPOINT MANUAL (DESATIVADO NA VERSÃO PURE YOLO) ---
@app.post("/segment_from_click")
async def segment_from_click():
    # O YOLO não suporta segmentação por clique num ponto.
    # Retornamos erro para o frontend saber.
    return JSONResponse(
        {"error": "Modo Pure YOLO não suporta correção manual (Isso requer SAM)."}, 
        status_code=400
    )