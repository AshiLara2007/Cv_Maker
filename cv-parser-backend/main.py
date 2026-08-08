import os
import json
import re
import time
from fastapi import FastAPI, UploadFile, File, HTTPException
from fastapi.middleware.cors import CORSMiddleware
from dotenv import load_dotenv
from google import genai
from google.genai import types

load_dotenv()

app = FastAPI()

app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
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

@app.post("/parse-cv")
async def parse_cv(file: UploadFile = File(...)):
    try:
        contents = await file.read()
        if len(contents) == 0:
            raise HTTPException(status_code=400, detail="Empty file")

        mime_type = get_mime_type(file.filename)

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
        """

        image_part = types.Part.from_bytes(data=contents, mime_type=mime_type)

        # 🔥 Use models that are most likely available
        model_names = [
            'models/gemini-2.0-flash',
            'models/gemini-2.5-flash',
            'models/gemini-1.5-flash',
            'models/gemini-flash-latest',
            'models/gemini-3.5-flash'
        ]

        # 🔥 Retry logic with exponential backoff
        max_retries = 5
        base_delay = 2

        for attempt in range(max_retries):
            for model_name in model_names:
                try:
                    response = client.models.generate_content(
                        model=model_name,
                        contents=[prompt, image_part]
                    )
                    print(f"✅ Successfully used model: {model_name}")
                    parsed = json.loads(clean_json_response(response.text))
                    parsed['photo_base64'] = None
                    return parsed
                except Exception as e:
                    # silently try next model
                    pass

            # All models failed this attempt
            if attempt < max_retries - 1:
                delay = base_delay * (attempt + 1)
                print(f"🔄 Retry {attempt + 1}/{max_retries} in {delay}s...")
                time.sleep(delay)

        # After all retries, raise a clear error
        raise HTTPException(
            status_code=503,
            detail="All Gemini models are currently unavailable. Please try again in 5-10 minutes."
        )

    except json.JSONDecodeError as e:
        raise HTTPException(status_code=500, detail=f"JSON parse error: {str(e)}")
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))

@app.get("/")
async def root():
    return {"message": "CV Parser API running with enhanced retry logic!"}

@app.get("/list-models")
async def list_models():
    try:
        models = client.models.list()
        # Simply return all model names (no filtering needed)
        return {"available": [m.name for m in models]}
    except Exception as e:
        return {"error": str(e)}