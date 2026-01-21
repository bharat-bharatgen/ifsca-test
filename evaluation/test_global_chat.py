#!/usr/bin/env python3
"""
Global Chat Testing Automation Script

This script automates testing of the /global-chat endpoint by:
1. Reading questions from an Excel or CSV file
2. Sending each question to the global chat API
3. Recording the actual responses
4. Using AI to evaluate responses against expected answers
5. Generating evaluation scores

Input file should have columns: questions/Questions, expected_answer/Expected Answer, actual_answer/Actual Answer
Supports both .xlsx and .csv formats
"""

import os
import sys
import json
import time
import requests
import pandas as pd
from typing import Dict, Any, Optional
from pathlib import Path
import argparse
from datetime import datetime
from dotenv import load_dotenv

# Load environment variables from .env file
load_dotenv()

# Configuration
API_BASE_URL = "http://localhost:3000"  # Your Next.js app URL
GLOBAL_CHAT_ENDPOINT = "/api/v1/chat/global"
GEMINI_API_KEY = os.getenv("GEMINI_API_KEY", "")  # Set this in your environment

# Colors for terminal output
class Colors:
    HEADER = '\033[95m'
    OKBLUE = '\033[94m'
    OKCYAN = '\033[96m'
    OKGREEN = '\033[92m'
    WARNING = '\033[93m'
    FAIL = '\033[91m'
    ENDC = '\033[0m'
    BOLD = '\033[1m'
    UNDERLINE = '\033[4m'


def print_status(message: str, status: str = "info"):
    """Print colored status messages"""
    colors = {
        "info": Colors.OKBLUE,
        "success": Colors.OKGREEN,
        "warning": Colors.WARNING,
        "error": Colors.FAIL,
        "header": Colors.HEADER
    }
    color = colors.get(status, Colors.ENDC)
    print(f"{color}{message}{Colors.ENDC}")


def authenticate(email: str, password: str) -> Optional[str]:
    """
    Authenticate with the Next.js app and get session cookie
    
    Note: This loads NEXT_AUTH_SESSION_TOKEN from your .env file automatically.
    """
    print_status(f"🔐 Authenticating as {email}...", "info")
    
    session_token = os.getenv("NEXT_AUTH_SESSION_TOKEN", "")
    
    if not session_token:
        print_status("❌ No session token found in .env file.", "error")
        print_status("Please add NEXT_AUTH_SESSION_TOKEN to your .env file:", "info")
        print("1. Open your browser and login to http://localhost:3000")
        print("2. Open Developer Tools > Application/Storage > Cookies")
        print("3. Copy the 'next-auth.session-token' cookie value")
        print("4. Add to .env file: NEXT_AUTH_SESSION_TOKEN=\"your-token-here\"")
        print()
        sys.exit(1)
    
    print_status(f"✅ Session token loaded from .env file", "success")
    return session_token


def send_chat_message(session_token: str, message: str, conversation_id: Optional[str] = None) -> Dict[str, Any]:
    """
    Send a message to the global chat endpoint
    
    Args:
        session_token: NextAuth session token
        message: The question/message to send
        conversation_id: Optional conversation ID to continue a conversation
    
    Returns:
        Dictionary with response, conversation_id, and latency
    """
    url = f"{API_BASE_URL}{GLOBAL_CHAT_ENDPOINT}"
    
    headers = {
        "Content-Type": "application/json",
        "Cookie": f"next-auth.session-token={session_token}"
    }
    
    payload = {
        "message": message,
    }
    
    if conversation_id:
        payload["conversationId"] = conversation_id
    
    try:
        start_time = time.time()
        # Use stream=True to handle the text/event-stream response
        response = requests.post(url, headers=headers, json=payload, timeout=120, stream=True)
        elapsed_time = time.time() - start_time
        
        response.raise_for_status()
        
        # Read the streaming response content
        full_text = ""
        conv_id = ""
        
        for chunk in response.iter_content(chunk_size=None, decode_unicode=True):
            if chunk:
                full_text += chunk
        
        # Update elapsed time after full response received
        elapsed_time = time.time() - start_time
        
        # Extract conversation ID from __CONV_ID__:xxx pattern
        import re
        conv_match = re.search(r'__CONV_ID__:([^\n\s]+)', full_text)
        if conv_match:
            conv_id = conv_match.group(1)
        
        # Clean the response text by removing status messages and metadata
        clean_text = full_text
        clean_text = re.sub(r'__STATUS__:[^\n]*\n?', '', clean_text)
        clean_text = re.sub(r'__CONV_ID__:[^\n]*\n?', '', clean_text)
        clean_text = re.sub(r'__TOKEN_USAGE__:[^\n]*\n?', '', clean_text)
        clean_text = re.sub(r'__PAGINATION__:[^\n]*\n?', '', clean_text)
        clean_text = clean_text.strip()
        
        return {
            "response": clean_text,
            "conversationId": conv_id,
            "latency": round(elapsed_time, 2),
            "success": True,
            "error": None
        }
    except requests.exceptions.RequestException as e:
        elapsed_time = time.time() - start_time if 'start_time' in locals() else 0
        return {
            "response": "",
            "conversationId": "",
            "latency": round(elapsed_time, 2),
            "success": False,
            "error": str(e)
        }


def evaluate_response_with_ai(question: str, expected: str, actual: str, gemini_api_key: str, max_retries: int = 3) -> Dict[str, Any]:
    """
    Use Google Gemini to evaluate the actual response against the expected answer
    
    Args:
        question: The original question
        expected: Expected answer
        actual: Actual response from the system
        gemini_api_key: Google Gemini API key
        max_retries: Maximum number of retries for rate limiting (default: 3)
    
    Returns:
        Dictionary with score (0-100) and evaluation reasoning
    """
    if not gemini_api_key:
        return {
            "score": 0,
            "reasoning": "Gemini API key not provided. Cannot evaluate.",
            "success": False
        }
    
    evaluation_prompt = f"""You are an AI evaluator tasked with scoring the quality of an AI system's response.

Question: {question}

Expected Answer: {expected}

Actual Answer: {actual}

Please evaluate the actual answer against the expected answer on the following criteria:
1. Factual Accuracy (40 points): Does the actual answer contain the same key facts as the expected answer?
2. Completeness (30 points): Does the actual answer cover all important points from the expected answer?
3. Relevance (20 points): Does the actual answer stay on topic and address the question?
4. Clarity (10 points): Is the actual answer clear and well-structured?

Provide your evaluation in the following JSON format:
{{
    "score": <total score out of 100>,
    "factual_accuracy": <score out of 40>,
    "completeness": <score out of 30>,
    "relevance": <score out of 20>,
    "clarity": <score out of 10>,
    "reasoning": "<brief explanation of the score>"
}}

Only return the JSON, no additional text."""

    # Gemini API endpoint - using gemini-2.0-flash model
    url = f"https://generativelanguage.googleapis.com/v1beta/models/gemini-2.0-flash:generateContent?key={gemini_api_key}"
    
    headers = {
        "Content-Type": "application/json"
    }
    
    payload = {
        "contents": [{
            "parts": [{
                "text": evaluation_prompt
            }]
        }],
        "generationConfig": {
            "temperature": 0.3,
            "topK": 40,
            "topP": 0.95,
            "maxOutputTokens": 1024,
            "responseMimeType": "application/json"
        }
    }
    
    # Retry logic with exponential backoff for rate limiting
    for attempt in range(max_retries):
        try:
            response = requests.post(
                url,
                headers=headers,
                json=payload,
                timeout=60
            )
            
            # Handle rate limiting with retry
            if response.status_code == 429:
                if attempt < max_retries - 1:
                    wait_time = (2 ** attempt) * 5  # 5s, 10s, 20s backoff
                    print_status(f"   ⏳ Rate limited, waiting {wait_time}s before retry ({attempt + 1}/{max_retries})...", "warning")
                    time.sleep(wait_time)
                    continue
                else:
                    return {
                        "score": 0,
                        "reasoning": f"Rate limited after {max_retries} retries",
                        "success": False
                    }
            
            response.raise_for_status()
            
            data = response.json()
            
            # Extract text from Gemini response
            if 'candidates' in data and len(data['candidates']) > 0:
                content = data['candidates'][0]['content']['parts'][0]['text']
                evaluation = json.loads(content)
                
                return {
                    "score": evaluation.get("score", 0),
                    "factual_accuracy": evaluation.get("factual_accuracy", 0),
                    "completeness": evaluation.get("completeness", 0),
                    "relevance": evaluation.get("relevance", 0),
                    "clarity": evaluation.get("clarity", 0),
                    "reasoning": evaluation.get("reasoning", ""),
                    "success": True
                }
            else:
                return {
                    "score": 0,
                    "reasoning": "No valid response from Gemini API",
                    "success": False
                }
        except Exception as e:
            if attempt < max_retries - 1:
                wait_time = (2 ** attempt) * 5
                print_status(f"   ⏳ Error occurred, waiting {wait_time}s before retry ({attempt + 1}/{max_retries})...", "warning")
                time.sleep(wait_time)
                continue
            return {
                "score": 0,
                "reasoning": f"Error during evaluation: {str(e)}",
                "success": False
            }
    
    # Fallback if all retries exhausted
    return {
        "score": 0,
        "reasoning": "All retries exhausted",
        "success": False
    }




def normalize_column_name(col: str) -> str:
    """Normalize column names to lowercase without spaces for comparison"""
    return col.strip().lower().replace(' ', '_').replace('-', '_')


def process_file(
    file_path: str,
    session_token: str,
    gemini_api_key: str,
    output_path: Optional[str] = None,
    delay_seconds: float = 1.0
):
    """
    Process the Excel or CSV file with questions and evaluate responses
    
    Args:
        file_path: Path to the input Excel (.xlsx) or CSV (.csv) file
        session_token: NextAuth session token
        gemini_api_key: Google Gemini API key for evaluation
        output_path: Optional path for output file (default: adds _results suffix)
        delay_seconds: Delay between API calls to avoid rate limiting
    """
    # Determine file type and read accordingly
    file_ext = Path(file_path).suffix.lower()
    print_status(f"\n📊 Reading {file_ext.upper()} file: {file_path}", "info")
    
    try:
        if file_ext == '.csv':
            # Try different encodings for CSV
            try:
                df = pd.read_csv(file_path, encoding='utf-8')
            except UnicodeDecodeError:
                try:
                    df = pd.read_csv(file_path, encoding='latin1')
                except UnicodeDecodeError:
                    df = pd.read_csv(file_path, encoding='cp1252')
        elif file_ext in ['.xlsx', '.xls']:
            df = pd.read_excel(file_path)
        else:
            print_status(f"❌ Unsupported file format: {file_ext}. Use .csv, .xlsx, or .xls", "error")
            sys.exit(1)
    except Exception as e:
        print_status(f"❌ Error reading file: {e}", "error")
        sys.exit(1)
    
    # Normalize column names for flexible matching
    column_mapping = {}
    normalized_cols = {normalize_column_name(col): col for col in df.columns}
    
    # Find the questions column (flexible naming)
    questions_col = None
    for potential in ['questions', 'question', 'q', 'query']:
        if potential in normalized_cols:
            questions_col = normalized_cols[potential]
            break
    
    # Find the expected answer column (flexible naming)
    expected_col = None
    for potential in ['expected_answer', 'expectedanswer', 'expected', 'answer', 'expected_response']:
        if potential in normalized_cols:
            expected_col = normalized_cols[potential]
            break
    
    # Find the actual answer column (flexible naming)
    actual_col = None
    for potential in ['actual_answer', 'actualanswer', 'actual', 'actual_response', 'response']:
        if potential in normalized_cols:
            actual_col = normalized_cols[potential]
            break
    
    # Validate required columns
    if not questions_col:
        print_status(f"❌ Missing required 'questions' column", "error")
        print_status(f"   Found columns: {', '.join(df.columns)}", "info")
        sys.exit(1)
    
    if not expected_col:
        print_status(f"❌ Missing required 'expected_answer' column", "error")
        print_status(f"   Found columns: {', '.join(df.columns)}", "info")
        sys.exit(1)
    
    print_status(f"✅ Using columns: Questions='{questions_col}', Expected='{expected_col}'", "success")
    
    # Add actual_answer column if it doesn't exist
    if not actual_col:
        actual_col = 'actual_answer'
        df[actual_col] = ""
        print_status(f"   Created new column: '{actual_col}'", "info")
    
    # Add evaluation columns if they don't exist
    if 'eval_score' not in df.columns:
        df['eval_score'] = 0
    if 'eval_reasoning' not in df.columns:
        df['eval_reasoning'] = ""
    
    # Add latency column
    if 'latency' not in df.columns:
        df['latency'] = 0.0
    
    # Check LIMIT from environment variable
    limit_str = os.getenv("LIMIT", "all").lower()
    total_questions = len(df)
    
    if limit_str == "all":
        questions_to_process = total_questions
        print_status(f"✅ Processing ALL {total_questions} questions", "success")
    else:
        try:
            limit_value = int(limit_str)
            questions_to_process = min(limit_value, total_questions)
            print_status(f"✅ LIMIT set to {limit_value} - Processing first {questions_to_process} questions", "info")
        except ValueError:
            print_status(f"⚠️  Invalid LIMIT value '{limit_str}', processing ALL questions", "warning")
            questions_to_process = total_questions
    
    print()
    
    print_status(f"✅ Found {len(df)} questions to process\n", "success")
    
    # Process each question
    conversation_id = None  # Use single conversation for all questions
    processed_count = 0
    
    for idx, row in df.iterrows():
        # Check if we've reached the limit
        if processed_count >= questions_to_process:
            print_status(f"\n✅ Reached LIMIT of {questions_to_process} questions. Stopping.", "success")
            break
        
        question = str(row[questions_col]).strip()
        expected = str(row[expected_col]).strip()
        
        if not question or question.lower() == 'nan':
            print_status(f"⏭️  Skipping row {idx + 1}: Empty question", "warning")
            continue
        
        processed_count += 1
        print_status(f"\n[{processed_count}/{questions_to_process}] Processing question:", "header")
        print(f"   Q: {question[:100]}{'...' if len(question) > 100 else ''}")
        
        # Send to chat API
        print_status("   🤖 Sending to global chat...", "info")
        chat_result = send_chat_message(session_token, question, conversation_id)
        
        # Store latency
        df.at[idx, 'latency'] = chat_result.get('latency', 0)
        
        if chat_result["success"]:
            actual_answer = chat_result["response"]
            conversation_id = chat_result["conversationId"]
            
            df.at[idx, actual_col] = actual_answer
            print_status(f"   ✅ Received response ({len(actual_answer)} chars) in {chat_result['latency']}s", "success")
            print(f"   A: {actual_answer[:150]}{'...' if len(actual_answer) > 150 else ''}")
            
            # Evaluate with AI
            if expected and expected.lower() != 'nan':
                print_status("   🎯 Evaluating response...", "info")
                eval_result = evaluate_response_with_ai(question, expected, actual_answer, gemini_api_key)
                
                if eval_result["success"]:
                    df.at[idx, 'eval_score'] = eval_result["score"]
                    df.at[idx, 'eval_reasoning'] = eval_result["reasoning"]
                    
                    # Add detailed scores if available
                    if 'factual_accuracy' in eval_result:
                        df.at[idx, 'factual_accuracy'] = eval_result['factual_accuracy']
                    if 'completeness' in eval_result:
                        df.at[idx, 'completeness'] = eval_result['completeness']
                    if 'relevance' in eval_result:
                        df.at[idx, 'relevance'] = eval_result['relevance']
                    if 'clarity' in eval_result:
                        df.at[idx, 'clarity'] = eval_result['clarity']
                    
                    score = eval_result["score"]
                    status = "success" if score >= 70 else "warning" if score >= 50 else "error"
                    print_status(f"   📊 Score: {score}/100", status)
                else:
                    print_status(f"   ⚠️  Evaluation failed: {eval_result['reasoning']}", "warning")
            else:
                print_status("   ⏭️  No expected answer provided, skipping evaluation", "warning")
        else:
            df.at[idx, actual_col] = f"ERROR: {chat_result['error']}"
            print_status(f"   ❌ Error: {chat_result['error']}", "error")
        
        # Delay to avoid rate limiting
        if processed_count < questions_to_process:  # Don't delay after last question
            time.sleep(delay_seconds)
    
    # Save results
    if not output_path:
        # Default to output.csv in the same directory as input file
        base_path = Path(file_path)
        output_path = base_path.parent / "output.csv"
    
    print_status(f"\n💾 Saving results to: {output_path}", "info")
    
    # Save in the appropriate format
    output_ext = Path(output_path).suffix.lower()
    try:
        if output_ext == '.csv':
            df.to_csv(output_path, index=False, encoding='utf-8')
        elif output_ext in ['.xlsx', '.xls']:
            df.to_excel(output_path, index=False)
        else:
            # Default to CSV if unknown extension
            output_path = Path(output_path).with_suffix('.csv')
            df.to_csv(output_path, index=False, encoding='utf-8')
    except Exception as e:
        print_status(f"❌ Error saving results: {e}", "error")
        sys.exit(1)
    
    print_status(f"✅ Results saved successfully!", "success")
    
    # Print summary statistics
    print_status("\n" + "=" * 60, "header")
    print_status("📈 SUMMARY STATISTICS", "header")
    
    # Filter for successful responses (handle both string and error messages)
    successful_responses = df[
        (df[actual_col].notna()) & 
        (df[actual_col].astype(str).str.len() > 0) &
        (~df[actual_col].astype(str).str.startswith('ERROR:'))
    ]
    evaluated_responses = df[df['eval_score'] > 0]
    
    print(f"\n   Total Questions:        {len(df)}")
    print(f"   Processed Questions:    {processed_count}")
    print(f"   Successful Responses:   {len(successful_responses)}")
    print(f"   Evaluated Responses:    {len(evaluated_responses)}")
    
    # Show average latency
    if len(successful_responses) > 0:
        avg_latency = successful_responses['latency'].mean()
        print(f"   Average Latency:        {avg_latency:.2f}s")
    
    if len(evaluated_responses) > 0:
        avg_score = evaluated_responses['eval_score'].mean()
        max_score = evaluated_responses['eval_score'].max()
        min_score = evaluated_responses['eval_score'].min()
        
        print(f"\n   Average Score:          {avg_score:.1f}/100")
        print(f"   Highest Score:          {max_score:.1f}/100")
        print(f"   Lowest Score:           {min_score:.1f}/100")
        
        # Score distribution
        excellent = len(evaluated_responses[evaluated_responses['eval_score'] >= 80])
        good = len(evaluated_responses[(evaluated_responses['eval_score'] >= 60) & (evaluated_responses['eval_score'] < 80)])
        fair = len(evaluated_responses[(evaluated_responses['eval_score'] >= 40) & (evaluated_responses['eval_score'] < 60)])
        poor = len(evaluated_responses[evaluated_responses['eval_score'] < 40])
        
        print(f"\n   Score Distribution:")
        print(f"   - Excellent (80-100):   {excellent}")
        print(f"   - Good (60-79):         {good}")
        print(f"   - Fair (40-59):         {fair}")
        print(f"   - Poor (0-39):          {poor}")
    
    print_status("\n" + "=" * 60 + "\n", "header")


def create_example_excel(output_path: str = "test_questions_template.xlsx"):
    """Create an example Excel template file"""
    example_data = {
        'questions': [
            'What is the purpose of this document?',
            'Who are the parties involved in this agreement?',
            'What is the effective date of the contract?'
        ],
        'expected_answer': [
            'This document outlines the terms and conditions of the service agreement.',
            'The parties are Company A (provider) and Company B (client).',
            'The contract is effective from January 1, 2024.'
        ],
        'actual_answer': ['', '', '']  # Will be filled by the script
    }
    
    df = pd.DataFrame(example_data)
    df.to_excel(output_path, index=False)
    print_status(f"✅ Example template created: {output_path}", "success")


def main():
    parser = argparse.ArgumentParser(
        description="Automate testing of global-chat endpoint with Excel or CSV files",
        formatter_class=argparse.RawDescriptionHelpFormatter,
        epilog="""
Examples:
  # Run tests with an Excel file
  python test_global_chat.py test_questions.xlsx
  
  # Run tests with a CSV file
  python test_global_chat.py question-answer-ifsca.csv

  # Create an example template
  python test_global_chat.py --create-template

  # Specify output file
  python test_global_chat.py test_questions.xlsx -o results.xlsx

  # Add delay between requests (useful for rate limiting)
  python test_global_chat.py test_questions.xlsx --delay 2.0

Environment variables (loaded from .env file):
  NEXT_AUTH_SESSION_TOKEN - Your NextAuth session token
  GEMINI_API_KEY          - Your Google Gemini API key for evaluation
        """
    )
    
    parser.add_argument(
        'input_file',
        nargs='?',
        help='Path to Excel (.xlsx) or CSV (.csv) file with questions and expected answers'
    )
    parser.add_argument(
        '-o', '--output',
        help='Output file path (default: output.csv)'
    )
    parser.add_argument(
        '--create-template',
        action='store_true',
        help='Create an example Excel template file'
    )
    parser.add_argument(
        '--delay',
        type=float,
        default=1.0,
        help='Delay in seconds between API calls (default: 1.0)'
    )
    parser.add_argument(
        '--email',
        default='rohit@ssingularity.co.in',
        help='Email for authentication (default: rohit@ssingularity.co.in)'
    )
    
    args = parser.parse_args()
    
    # Print header
    print_status("\n" + "=" * 60, "header")
    print_status("  Global Chat Testing Automation", "header")
    print_status("=" * 60 + "\n", "header")
    
    # Create template mode
    if args.create_template:
        create_example_excel()
        return
    
    # Validate input file
    if not args.input_file:
        parser.print_help()
        sys.exit(1)
    
    if not os.path.exists(args.input_file):
        print_status(f"❌ Input file not found: {args.input_file}", "error")
        sys.exit(1)
    
    # Validate file extension
    file_ext = Path(args.input_file).suffix.lower()
    if file_ext not in ['.csv', '.xlsx', '.xls']:
        print_status(f"❌ Unsupported file format: {file_ext}", "error")
        print_status("   Supported formats: .csv, .xlsx, .xls", "info")
        sys.exit(1)
    
    # Get credentials
    session_token = authenticate(args.email, "")
    gemini_api_key = os.getenv("GEMINI_API_KEY", "")
    
    if not gemini_api_key:
        print_status("⚠️  Gemini API key not found. Evaluation will be skipped.", "warning")
        print_status("   Set GEMINI_API_KEY environment variable to enable AI evaluation.", "info")
    
    # Process the file
    try:
        process_file(
            file_path=args.input_file,
            session_token=session_token,
            gemini_api_key=gemini_api_key,
            output_path=args.output,
            delay_seconds=args.delay
        )
    except KeyboardInterrupt:
        print_status("\n\n⚠️  Process interrupted by user", "warning")
        sys.exit(1)
    except Exception as e:
        print_status(f"\n❌ Unexpected error: {e}", "error")
        import traceback
        traceback.print_exc()
        sys.exit(1)


if __name__ == "__main__":
    main()
