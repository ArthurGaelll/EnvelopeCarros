# backend/main.py
from fastapi import FastAPI, File, UploadFile, Form
from fastapi.responses import JSONResponse
from fastapi.middleware.cors import CORSMiddleware
import cv2
import numpy as np
import torch
import base64
from ultralytics import YOLO
from segment_anything import sam_model_registry, SamPredictor

# --- CONFIGURAÇÕES ---
YOUR_YOLO_MODEL = "best.pt" 
SAM_CHECKPOINT = "sam_vit_b_01ec64.pth" 
SAM_TYPE = "vit_b"

app = FastAPI()

app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

print("⚙️ Carregando modelos...")
device = "cuda" if torch.cuda.is_available() else "cpu"

try:
    yolo_model = YOLO(YOUR_YOLO_MODEL)
    sam = sam_model_registry[SAM_TYPE](checkpoint=SAM_CHECKPOINT)
    sam.to(device=device)
    sam_predictor = SamPredictor(sam)
    print(f"✅ Modelos prontos na {device}!")
except Exception as e:
    print(f"❌ Erro carregando modelos: {e}")
    exit(1)

# --- FUNÇÕES ---
def encode_to_base64(img):
    success, buffer = cv2.imencode('.png', img)
    if not success: return ""
    return base64.b64encode(buffer).decode('utf-8')

def mask_to_polygon(mask_np):
    contours, _ = cv2.findContours(mask_np, cv2.RETR_EXTERNAL, cv2.CHAIN_APPROX_SIMPLE)
    if not contours: return []
    largest = max(contours, key=cv2.contourArea)
    epsilon = 0.002 * cv2.arcLength(largest, True)
    approx = cv2.approxPolyDP(largest, epsilon, True)
    return approx.reshape(-1, 2).tolist()

def resize_image(image, max_size=1024):
    h, w = image.shape[:2]
    if max(h, w) > max_size:
        scale = max_size / max(h, w)
        new_w, new_h = int(w * scale), int(h * scale)
        return cv2.resize(image, (new_w, new_h))
    return image

# --- ENDPOINT 1: AUTOMÁTICO ---
@app.post("/analyze_car")
async def analyze_car(image: UploadFile = File(...)):
    print("\n🚀 Analisando carro...")
    try:
        contents = await image.read()
        nparr = np.frombuffer(contents, np.uint8)
        original_img = cv2.imdecode(nparr, cv2.IMREAD_COLOR)
        if original_img is None: return JSONResponse({"error": "Erro img"}, 400)

        original_img = resize_image(original_img)
        h, w = original_img.shape[:2]

        results = yolo_model(original_img, verbose=False)[0]
        sam_predictor.set_image(original_img)
        
        parts_data = []
        
        for i, box in enumerate(results.boxes):
            try:
                cls_id = int(box.cls)
                label = results.names[cls_id]
                box_xyxy = box.xyxy.cpu().numpy()[0]
                
                box_tensor = torch.tensor(np.array([box_xyxy]), device=sam_predictor.device)
                transformed_box = sam_predictor.transform.apply_boxes_torch(box_tensor, (h, w))
                
                masks, _, _ = sam_predictor.predict_torch(
                    point_coords=None, point_labels=None,
                    boxes=transformed_box, multimask_output=False
                )
                mask_np = masks[0, 0].cpu().numpy().astype(np.uint8)
                
                polygon = mask_to_polygon(mask_np)
                if len(polygon) < 3: continue

                img_rgba = cv2.cvtColor(original_img, cv2.COLOR_BGR2BGRA)
                img_rgba[:, :, 3] = mask_np * 255
                ys, xs = np.where(mask_np > 0)
                if len(ys) > 0:
                    y1, y2, x1, x2 = ys.min(), ys.max(), xs.min(), xs.max()
                    cropped = img_rgba[y1:y2+1, x1:x2+1]
                    b64_crop = encode_to_base64(cropped)
                    
                    parts_data.append({
                        "id": f"yolo_{i}", # ID DE TRAVA
                        "label": label,
                        "points": polygon,
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
        print(f"Erro: {e}")
        return JSONResponse({"error": str(e)}, 500)


# --- ENDPOINT 2: MANUAL (CORREÇÃO) ---
@app.post("/segment_from_click")
async def segment_from_click(
    image: UploadFile = File(...),
    click_x: int = Form(...),
    click_y: int = Form(...)
):
    print(f"👆 Criando peça manual em ({click_x}, {click_y})...")
    try:
        contents = await image.read()
        nparr = np.frombuffer(contents, np.uint8)
        original_img = cv2.imdecode(nparr, cv2.IMREAD_COLOR)
        
        original_img = resize_image(original_img)
        h, w = original_img.shape[:2]

        sam_predictor.set_image(original_img)

        point_coords = np.array([[click_x, click_y]])
        point_labels = np.array([1])

        point_coords_tensor = sam_predictor.transform.apply_coords(point_coords, (h, w))
        point_coords_tensor = torch.as_tensor(point_coords_tensor, dtype=torch.float, device=sam_predictor.device).unsqueeze(0)
        point_labels_tensor = torch.as_tensor(point_labels, dtype=torch.int, device=sam_predictor.device).unsqueeze(0)

        masks, _, _ = sam_predictor.predict_torch(
            point_coords=point_coords_tensor,
            point_labels=point_labels_tensor,
            boxes=None,
            multimask_output=False
        )
        mask_np = masks[0, 0].cpu().numpy().astype(np.uint8)

        polygon = mask_to_polygon(mask_np)
        if len(polygon) < 3: return JSONResponse({"error": "Vazio"}, 400)

        img_rgba = cv2.cvtColor(original_img, cv2.COLOR_BGR2BGRA)
        img_rgba[:, :, 3] = mask_np * 255
        ys, xs = np.where(mask_np > 0)
        
        if len(ys) > 0:
            y1, y2, x1, x2 = ys.min(), ys.max(), xs.min(), xs.max()
            cropped = img_rgba[y1:y2+1, x1:x2+1]
            b64_crop = encode_to_base64(cropped)
            
            return JSONResponse({
                "id": f"manual_{click_x}_{click_y}", # ID DE PERMISSÃO
                "label": "Correção Manual",
                "points": polygon,
                "image": f"data:image/png;base64,{b64_crop}"
            })
            
        return JSONResponse({"error": "Vazio"}, 400)

    except Exception as e:
        print(f"Erro click: {e}")
        return JSONResponse({"error": str(e)}, 500)