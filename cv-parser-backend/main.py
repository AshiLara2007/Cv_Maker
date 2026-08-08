import os
import json
import re
from fastapi import FastAPI, UploadFile, File, HTTPException
from fastapi.middleware.cors import CORSMiddleware
from dotenv import load_dotenv
from google import genai
from google.genai import types

load_dotenv()

app = FastAPI()

app.add_middleware(
    CORSMiddleware,
    allow_origins=["http://localhost:5173"],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

GEMINI_API_KEY = os.getenv("GEMINI_API_KEY")
if not GEMINI_API_KEY:
    raise ValueError("GEMINI_API_KEY not found in .env file")

client = genai.Client(api_key=GEMINI_API_KEY)

def clean_json_response(text):
    match = re.search(r'```(?:json)?\s*(\{.*\})\s*```', text, re.DOTALL)
    if match:
        return match.group(1)
    match = re.search(r'\{.*\}', text, re.DOTALL)
    if match:
        return match.group(0)
    return text

def get_mime_type(filename: str) -> str:
    ext = filename.split('.')[-1].lower()
    mime_map = {
        'jpg': 'image/jpeg',
        'jpeg': 'image/jpeg',
        'png': 'image/png',
        'webp': 'image/webp',
        'gif': 'image/gif'
    }
    return mime_map.get(ext, 'image/jpeg')

# 🔥 Face detection completely disabled
def extract_face_base64(image_bytes: bytes) -> str | None:
    """Face detection disabled - always returns None."""
    return None

@app.post("/parse-cv")
async def parse_cv(file: UploadFile = File(...)):
    try:
        contents = await file.read()
        if len(contents) == 0:
            raise HTTPException(status_code=400, detail="Empty file")

        mime_type = get_mime_type(file.filename)

        # Always None
        photo_base64 = extract_face_base64(contents)

        prompt = """
        You are an expert CV parser. Analyze this CV image carefully.
        The CV is in a tabular format. Extract these fields as JSON.
        If missing, return null.

        Fields:
        1. "full_name" - Look for "Name In Full"
        2. "date_of_birth" - Convert to YYYY-MM-DD
        3. "gender" - "Sex" (MALE/FEMALE)
        4. "marital_status" - "Marital Status"
        5. "job_title" - "Post applied for"
        6. "nationality" - "Nationality"
        7. "religion" - "Religion"
        8. "salary" - "Monthly SALARY" (number only)
        9. "years_experience" - Look for "FIRST TIME" -> 0, else extract years
        10. "worker_type" - "First Time" or "Experienced"

        Return ONLY valid JSON. No other text.
        Example:
        {"full_name":"ASMAN AHAMED SABDEEN","date_of_birth":"2004-11-23","gender":"MALE","marital_status":"SINGLE","job_title":"DRIVER","nationality":"SRI LANKAN","religion":"MUSLIM","salary":1500,"years_experience":0,"worker_type":"First Time"}
        """

        image_part = types.Part.from_bytes(data=contents, mime_type=mime_type)

        # Model priority (gemini-1.5-flash included for better quota)
        model_names = [
            'models/gemini-1.5-flash',
            'models/gemini-3.5-flash',
            'models/gemini-2.0-flash',
            'models/gemini-flash-latest'
        ]

        response = None
        last_error = None

        for model_name in model_names:
            try:
                response = client.models.generate_content(
                    model=model_name,
                    contents=[prompt, image_part]
                )
                print(f"✅ Successfully used model: {model_name}")
                break
            except Exception as e:
                last_error = e
                print(f"❌ Failed with {model_name}: {str(e)}")
                continue

        if response is None:
            raise HTTPException(
                status_code=500,
                detail=f"All models failed. Last error: {str(last_error)}"
            )

        cleaned = clean_json_response(response.text)
        parsed = json.loads(cleaned)

        # photo_base64 is always None
        parsed['photo_base64'] = photo_base64

        return parsed

    except json.JSONDecodeError as e:
        raise HTTPException(
            status_code=500,
            detail=f"JSON parse error: {str(e)}. Raw: {response.text}"
        )
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))

@app.get("/")
async def root():
    return {"message": "CV Parser API running (face detection disabled)"}

@app.get("/list-models")
async def list_models():
    try:
        models = client.models.list()
        available = [m.name for m in models if 'generateContent' in m.supported_generation_methods]
        return {"available": available}
    except Exception as e:
        return {"error": str(e)}