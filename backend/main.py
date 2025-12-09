# backend/main.py ATUALIZADO
from fastapi import FastAPI, File, UploadFile, Form
from fastapi.responses import StreamingResponse
from fastapi.middleware.cors import CORSMiddleware
import cv2
import numpy as np
import torch
import matplotlib.colors as mcolors
from ultralytics import YOLO
from segment_anything import sam_model_registry, SamPredictor
import io
import os

# --- CONFIGURAÇÕES ---
YOUR_YOLO_MODEL = "best.pt" 
SAM_CHECKPOINT = "sam_vit_b_01ec64.pth"
SAM_TYPE = "vit_b"

app = FastAPI()

app.add_middleware(
    CORSMiddleware,
    allow_origins=["http://localhost:3000"],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

print("⚙️ Inicializando modelos na GPU Local...")
# Forçar uso de GPU se disponível
device = "cuda" if torch.cuda.is_available() else "cpu"
print(f"✅ Dispositivo detectado: {device.upper()}")

# Carregar YOLO
try:
    yolo_model = YOLO(YOUR_YOLO_MODEL)
    print(f"✅ Modelo YOLO '{YOUR_YOLO_MODEL}' carregado.")
    print(f"   Classes conhecidas: {yolo_model.names}")
except Exception as e:
    print(f"❌ Erro fatal ao carregar YOLO: {e}")
    exit(1)

# Carregar SAM
try:
    sam = sam_model_registry[SAM_TYPE](checkpoint=SAM_CHECKPOINT)
    sam.to(device=device)
    sam_predictor = SamPredictor(sam)
    print(f"✅ Modelo SAM carregado na {device.upper()}.")
except Exception as e:
    print(f"❌ Erro fatal ao carregar SAM: {e}")
    exit(1)

print("🚀 Servidor pronto!")

@app.post("/process_click")
async def process_click(
    image: UploadFile = File(...),
    click_x: int = Form(...),
    click_y: int = Form(...),
    color_hex: str = Form(...),
    opacity: float = Form(...),
):
    contents = await image.read()
    nparr = np.frombuffer(contents, np.uint8)
    curr_image = cv2.imdecode(nparr, cv2.IMREAD_COLOR)
    
    if curr_image is None: return {"error": "Falha ao ler imagem"}

    print(f"\n🖱️ Clique recebido: X={click_x}, Y={click_y} | Cor: {color_hex}")

    # 1. YOLO DETECTA TUDO
    results = yolo_model(curr_image, verbose=False)[0]
    selected_box = None
    detected_name = "Nada"
    
    # Debug: Mostra o que ele achou na imagem inteira
    print(f"   -> O YOLO encontrou {len(results.boxes)} objetos nesta imagem.")

    for box in results.boxes:
        # Pega ID da classe e Nome
        cls_id = int(box.cls)
        cls_name = results.names[cls_id]
        
        # Coordenadas da caixa
        x1, y1, x2, y2 = box.xyxy.cpu().numpy()[0]
        
        # Verifica se o clique está dentro
        if (x1 <= click_x <= x2) and (y1 <= click_y <= y2):
            selected_box = box.xyxy.cpu().numpy()[0]
            detected_name = cls_name
            print(f"   ✅ CLIQUE VÁLIDO! Acertou: '{cls_name}' (ID {cls_id})")
            break # Para na primeira peça que encontrar
            
    if selected_box is None:
        print("   ⚠️ O clique não caiu dentro de nenhuma caixa detectada.")
        # Retorna imagem original
        _, encoded_img = cv2.imencode('.jpg', curr_image)
        return StreamingResponse(io.BytesIO(encoded_img.tobytes()), media_type="image/jpeg")

    # 2. SAM SEGMENTA
    print(f"   -> Enviando '{detected_name}' para o SAM refinar...")
    sam_predictor.set_image(curr_image)
    
    box_tensor = torch.tensor(np.array([selected_box]), device=sam_predictor.device)
    transformed_box = sam_predictor.transform.apply_boxes_torch(box_tensor, curr_image.shape[:2])
    
    point_coords = np.array([[click_x, click_y]])
    point_labels = np.array([1])
    point_coords_tensor = sam_predictor.transform.apply_coords(point_coords, curr_image.shape[:2])
    point_coords_tensor = torch.as_tensor(point_coords_tensor, dtype=torch.float, device=sam_predictor.device).unsqueeze(0)
    point_labels_tensor = torch.as_tensor(point_labels, dtype=torch.int, device=sam_predictor.device).unsqueeze(0)

    masks_tensor, _, _ = sam_predictor.predict_torch(
        point_coords=point_coords_tensor,
        point_labels=point_labels_tensor,
        boxes=transformed_box,
        multimask_output=False,
    )
    mask_np = masks_tensor[0, 0].cpu().numpy().astype(np.uint8)

    # 3. PINTURA
    try:
        rgb_float = mcolors.to_rgb(color_hex)
    except:
        rgb_float = (0.0, 1.0, 0.0)

    curr_img_float = curr_image.astype(np.float32) / 255.0
    color_layer = np.full_like(curr_img_float, np.array(rgb_float, dtype=np.float32))
    
    # Inverte RGB para BGR (OpenCV) para a cor ficar certa
    color_layer = color_layer[..., ::-1]

    blended = cv2.addWeighted(curr_img_float, 1 - opacity, color_layer, opacity, 0)
    result = np.where(mask_np[..., None] > 0, blended, curr_img_float)
    final_result_uint8 = (np.clip(result, 0, 1) * 255).astype(np.uint8)

    _, encoded_img = cv2.imencode('.jpg', final_result_uint8)
    return StreamingResponse(io.BytesIO(encoded_img.tobytes()), media_type="image/jpeg")