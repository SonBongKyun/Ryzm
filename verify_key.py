
import os
from dotenv import load_dotenv

load_dotenv()
key = os.getenv("GENAI_API_KEY")

if key:
    print(f"API Key Found: {key[:5]}... (Length: {len(key)})")
else:
    print("API Key NOT Found!")
    exit(1)
