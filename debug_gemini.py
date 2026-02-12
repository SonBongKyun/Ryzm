
import os
import google.generativeai as genai
from dotenv import load_dotenv

load_dotenv()
api_key = os.getenv("GENAI_API_KEY")

print(f"Loaded Key: {api_key[:5]}... (Length: {len(api_key) if api_key else 0})")

if not api_key:
    print("FATAL: No API Key found.")
    exit(1)

genai.configure(api_key=api_key)

try:
    print("Attempting to connect to Gemini...")
    model = genai.GenerativeModel('gemini-2.0-flash')
    response = model.generate_content("Hello, can you hear me?")
    print("SUCCESS! API is working.")
    print("Response:", response.text)
except Exception as e:
    print("\nERROR DETAILS:")
    print(e)
