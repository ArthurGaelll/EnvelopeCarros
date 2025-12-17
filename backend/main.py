# backend/main.py (Versão PURE YOLO - Mais leve e rápido)
from fastapi import FastAPI, File, UploadFile
from fastapi.responses import JSONResponse
from fastapi.middleware.cors import CORSMiddleware
import cv2
import numpy as np
import base64
from ultralytics import YOLO

# --- CONFIGURAÇÃO ---
YOUR_YOLO_MODEL = "best.pt" 

app = FastAPI()

app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

print("⚙️ Carregando YOLO Solo...")
try:
    # Carrega YOLO
    yolo_model = YOLO(YOUR_YOLO_MODEL) 
    print(f"✅ Modelo carregado!")
except Exception as e:
    print(f"❌ Erro ao carregar YOLO: {e}")
    exit(1)

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
    print("\n🚀 Analisando com YOLO...")
    try:
        contents = await image.read()
        nparr = np.frombuffer(contents, np.uint8)
        original_img = cv2.imdecode(nparr, cv2.IMREAD_COLOR)
        if original_img is None: return JSONResponse({"error": "Erro img"}, 400)

        original_img = resize_image(original_img)
        h, w = original_img.shape[:2]

        # retina_masks=True melhora muito a qualidade da borda
        results = yolo_model(original_img, retina_masks=True, verbose=False)[0]

        parts_data = []
        
        # Se não achou nada, retorna lista vazia
        if results.masks is None:
             print("⚠️ Nenhuma peça detectada.")
             original_b64 = encode_to_base64(original_img)
             return JSONResponse({
                "width": w, "height": h,
                "original": f"data:image/png;base64,{original_b64}",
                "parts": []
            })

        for i, (mask, box) in enumerate(zip(results.masks, results.boxes)):
            try:
                cls_id = int(box.cls)
                label = results.names[cls_id]
                
                # Pega polígono direto do YOLO
                polygon_points = mask.xy[0].astype(int).tolist()
                if len(polygon_points) < 3: continue

                # Calcula área para ordenação (maçaneta vs porta)
                pts_np = np.array(polygon_points, np.int32)
                area = cv2.contourArea(pts_np)

                # Recorte (Crop)
                mask_img = np.zeros((h, w), dtype=np.uint8)
                cv2.fillPoly(mask_img, [pts_np], 255)
                
                img_rgba = cv2.cvtColor(original_img, cv2.COLOR_BGR2BGRA)
                img_rgba[:, :, 3] = mask_img # Transparência

                x_coords = [p[0] for p in polygon_points]
                y_coords = [p[1] for p in polygon_points]
                y1, y2 = max(0, min(y_coords)), min(h, max(y_coords))
                x1, x2 = max(0, min(x_coords)), min(w, max(x_coords))

                cropped = img_rgba[y1:y2, x1:x2]
                b64_crop = encode_to_base64(cropped)

                parts_data.append({
                    "id": f"yolo_{i}",
                    "label": label,
                    "points": polygon_points,
                    "area": area,
                    "image": f"data:image/png;base64,{b64_crop}"
                })

            except: continue

        original_b64 = encode_to_base64(original_img)
        return JSONResponse({
            "width": w, "height": h,
            "original": f"data:image/png;base64,{original_b64}",
            "parts": parts_data
        })

    except Exception as e:
        print(f"🔥 Erro: {e}")
        return JSONResponse({"error": str(e)}, 500)

# O Endpoint manual não é necessário no Pure YOLO
@app.post("/segment_from_click")
async def segment_from_click():
    return JSONResponse({"error": "Use apenas YOLO"}, 400)