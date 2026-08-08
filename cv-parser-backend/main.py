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

# CORS
app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

# 🔥 Multiple API Keys (Add as many as you want)
API_KEYS = [
    os.getenv("GEMINI_API_KEY_1"),
    os.getenv("GEMINI_API_KEY_2"),
    os.getenv("GEMINI_API_KEY_3"),
    os.getenv("GEMINI_API_KEY_4"),
    os.getenv("GEMINI_API_KEY_5"),
]

# Remove any empty/None keys
API_KEYS = [key for key in API_KEYS if key]

if not API_KEYS:
    raise ValueError("No Gemini API keys found! Please set GEMINI_API_KEY_1 to GEMINI_API_KEY_5")

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

        # 🔥 UPDATED: Models prioritized by HIGH RPD (Requests Per Day)
        model_names = [
            # 🔥 HIGHEST RPD (1,500) - Try these FIRST
            'models/gemini-2.0-flash-lite',     # 1,500 RPD ⭐ Best
            'models/gemini-1.5-flash',          # 1,500 RPD ⭐ Best
            
            # 🔥 GOOD RPD (1,000)
            'models/gemini-2.5-flash-lite',     # 1,000 RPD ⭐ Good
            
            # 🔥 MEDIUM RPD (250)
            'models/gemini-2.5-flash',          # 250 RPD ⭐ Good
            
            # 🔥 LOW RPD (20) - Only as fallback
            'models/gemini-3.5-flash-lite',     # 20 RPD
            'models/gemini-3.5-flash',          # 20 RPD
            'models/gemini-2.0-flash',          # 20 RPD
            'models/gemini-2.5-pro',            # 20 RPD
            'models/gemini-1.5-pro',            # 20 RPD
            
            # 🔥 LATEST ALIASES
            'models/gemini-flash-latest',
            'models/gemini-flash-lite-latest',
            
            # 🔥 PREVIEW MODELS (if available)
            'models/gemini-3.1-flash-lite-preview',
            'models/gemini-3.1-flash-lite',
            'models/gemini-2.5-flash-image',
        ]

        # 🔥 Try all combinations: Key × Model
        max_retries = 3
        base_delay = 2

        last_error = None

        for key_index, api_key in enumerate(API_KEYS):
            try:
                # Create a new client with this API key
                client = genai.Client(api_key=api_key)
                print(f"🔑 Trying API Key #{key_index + 1}...")

                for model_name in model_names:
                    try:
                        response = client.models.generate_content(
                            model=model_name,
                            contents=[prompt, image_part]
                        )
                        print(f"✅ SUCCESS! Key #{key_index + 1} + Model: {model_name}")
                        parsed = json.loads(clean_json_response(response.text))
                        parsed['photo_base64'] = None
                        return parsed
                    except Exception as e:
                        error_msg = str(e)
                        if '503' in error_msg or 'UNAVAILABLE' in error_msg:
                            print(f"⚠️ Model {model_name} busy with Key #{key_index + 1}")
                            continue
                        elif '429' in error_msg or 'RESOURCE_EXHAUSTED' in error_msg:
                            print(f"⚠️ Quota exhausted for Key #{key_index + 1} with {model_name}")
                            continue
                        elif '401' in error_msg or 'UNAUTHENTICATED' in error_msg:
                            print(f"❌ Invalid Key #{key_index + 1}, skipping...")
                            break  # Skip this key entirely
                        else:
                            print(f"⚠️ Error with Key #{key_index + 1} + {model_name}: {error_msg[:50]}...")
                            continue

            except Exception as e:
                print(f"❌ Failed to create client with Key #{key_index + 1}: {str(e)}")
                continue

        # If all keys and models fail
        raise HTTPException(
            status_code=503,
            detail="All Gemini models and API keys are currently unavailable. Please try again in 5-10 minutes."
        )

    except json.JSONDecodeError as e:
        raise HTTPException(status_code=500, detail=f"JSON parse error: {str(e)}")
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))

@app.get("/")
async def root():
    return {"message": "CV Parser API with Multiple API Keys + All Models!"}

@app.get("/list-models")
async def list_models():
    try:
        # Use the first valid key to list models
        for key in API_KEYS:
            try:
                client = genai.Client(api_key=key)
                models = client.models.list()
                return {"available": [m.name for m in models]}
            except:
                continue
        return {"error": "No valid API key found"}
    except Exception as e:
        return {"error": str(e)}