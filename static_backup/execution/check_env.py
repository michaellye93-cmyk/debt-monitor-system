import os
from dotenv import load_dotenv

def check_env():
    load_dotenv()
    print("Checking environment variables...")
    
    required_vars = ["PROJECT_ID"]
    optional_vars = ["GOOGLE_APPLICATION_CREDENTIALS", "OPENAI_API_KEY", "ANTHROPIC_API_KEY"]
    
    missing_required = [var for var in required_vars if not os.getenv(var)]
    missing_optional = [var for var in optional_vars if not os.getenv(var)]
    
    if missing_required:
        print(f"CRITICAL ERROR: Missing required environment variables: {', '.join(missing_required)}")
        return False
    
    if missing_optional:
        print(f"Warning: Missing optional environment variables: {', '.join(missing_optional)}")
    
    print("Environment variables checked successfully.")
    
    # Create .tmp directory if it doesn't exist
    if not os.path.exists(".tmp"):
        os.makedirs(".tmp")
        print("Created .tmp directory.")
        
    with open(".tmp/bootstrap_report.txt", "w") as f:
        f.write("Bootstrap environment check passed.\n")
        f.write(f"Project ID: {os.getenv('PROJECT_ID')}\n")
        
    print("Bootstrap report generated in .tmp/bootstrap_report.txt")
    return True

if __name__ == "__main__":
    if check_env():
        print("System is ready for orchestration.")
    else:
        print("System is NOT ready. Please fix environment issues.")
