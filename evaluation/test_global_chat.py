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
import re
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

# List of Gemini models to use for evaluation
EVALUATION_MODELS = [
    "gemini-2.0-flash",
    "gemini-2.5-flash",
    "gemini-3-flash-preview"
]

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


def evaluate_response_with_ai(question: str, expected: str, actual: str, gemini_api_key: str, model: str = "gemini-2.0-flash", max_retries: int = 3) -> Dict[str, Any]:
    """
    Use Google Gemini to evaluate the actual response against the expected answer
    
    Args:
        question: The original question
        expected: Expected answer
        actual: Actual response from the system
        gemini_api_key: Google Gemini API key
        model: Gemini model to use for evaluation (default: gemini-2.0-flash)
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

    # Gemini API endpoint - using the specified model
    url = f"https://generativelanguage.googleapis.com/v1beta/models/{model}:generateContent?key={gemini_api_key}"
    
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
                
                # Try to parse JSON with multiple fallback methods
                evaluation = None
                
                # Method 1: Direct JSON parse
                try:
                    evaluation = json.loads(content)
                except json.JSONDecodeError:
                    pass
                
                # Method 2: Fix common JSON issues (single quotes, trailing commas)
                if evaluation is None:
                    try:
                        fixed_content = content
                        # Remove any markdown code blocks
                        fixed_content = re.sub(r'```json\s*', '', fixed_content)
                        fixed_content = re.sub(r'```\s*', '', fixed_content)
                        # Replace single quotes with double quotes (carefully)
                        fixed_content = re.sub(r"'([^']*)':", r'"\1":', fixed_content)
                        fixed_content = re.sub(r":\s*'([^']*)'", r': "\1"', fixed_content)
                        # Remove trailing commas before } or ]
                        fixed_content = re.sub(r',\s*([}\]])', r'\1', fixed_content)
                        evaluation = json.loads(fixed_content)
                    except json.JSONDecodeError:
                        pass
                
                # Method 3: Extract JSON object using regex
                if evaluation is None:
                    try:
                        json_match = re.search(r'\{[^{}]*"score"[^{}]*\}', content, re.DOTALL)
                        if json_match:
                            evaluation = json.loads(json_match.group())
                    except json.JSONDecodeError:
                        pass
                
                # Method 4: Try to extract score directly with regex as last resort
                if evaluation is None:
                    try:
                        score_match = re.search(r'"score"\s*:\s*(\d+)', content)
                        reasoning_match = re.search(r'"reasoning"\s*:\s*"([^"]*)"', content)
                        if score_match:
                            evaluation = {
                                "score": int(score_match.group(1)),
                                "reasoning": reasoning_match.group(1) if reasoning_match else "Extracted from malformed response"
                            }
                    except Exception:
                        pass
                
                if evaluation:
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
                        "reasoning": f"Could not parse JSON response: {content[:200]}",
                        "success": False
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
    delay_seconds: float = 1.0,
    models: list = None
):
    """
    Process the Excel or CSV file with questions and evaluate responses using multiple models
    
    Args:
        file_path: Path to the input Excel (.xlsx) or CSV (.csv) file
        session_token: NextAuth session token
        gemini_api_key: Google Gemini API key for evaluation
        output_path: Optional path for output file (only used for single model)
        delay_seconds: Delay between API calls to avoid rate limiting
        models: List of Gemini models to use for evaluation (default: EVALUATION_MODELS)
    """
    if models is None:
        models = EVALUATION_MODELS
    
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
    
    # ========================================
    # PHASE 1: Collect responses from chat API (runs once)
    # ========================================
    print_status("=" * 60, "header")
    print_status("  PHASE 1: Collecting responses from Global Chat API", "header")
    print_status("=" * 60, "header")
    
    conversation_id = None  # Use single conversation for all questions
    processed_count = 0
    processed_indices = []  # Track which indices were processed
    
    for idx, row in df.iterrows():
        # Check if we've reached the limit
        if processed_count >= questions_to_process:
            print_status(f"\n✅ Reached LIMIT of {questions_to_process} questions. Stopping.", "success")
            break
        
        question = str(row[questions_col]).strip()
        
        if not question or question.lower() == 'nan':
            print_status(f"⏭️  Skipping row {idx + 1}: Empty question", "warning")
            continue
        
        processed_count += 1
        processed_indices.append(idx)
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
        else:
            df.at[idx, actual_col] = f"ERROR: {chat_result['error']}"
            print_status(f"   ❌ Error: {chat_result['error']}", "error")
        
        # Delay to avoid rate limiting
        if processed_count < questions_to_process:  # Don't delay after last question
            time.sleep(delay_seconds)
    
    # ========================================
    # PHASE 2: Evaluate with each model and save output files
    # ========================================
    print_status("\n" + "=" * 60, "header")
    print_status("  PHASE 2: Evaluating responses with multiple models", "header")
    print_status(f"  Models: {', '.join(models)}", "header")
    print_status("=" * 60, "header")
    
    output_files = []
    
    for model_idx, model in enumerate(models, 1):
        print_status(f"\n{'─' * 60}", "info")
        print_status(f"  Evaluating with Model {model_idx}/{len(models)}: {model}", "header")
        print_status(f"{'─' * 60}", "info")
        
        # Create a copy of the dataframe for this model's evaluation
        model_df = df.copy()
        
        # Add evaluation columns for this model
        model_df['eval_score'] = 0
        model_df['eval_reasoning'] = ""
        model_df['factual_accuracy'] = 0
        model_df['completeness'] = 0
        model_df['relevance'] = 0
        model_df['clarity'] = 0
        
        # Evaluate each processed question
        eval_count = 0
        for idx in processed_indices:
            question = str(model_df.at[idx, questions_col]).strip()
            expected = str(model_df.at[idx, expected_col]).strip()
            actual = str(model_df.at[idx, actual_col]).strip()
            
            # Skip if no actual answer or it's an error
            if not actual or actual.startswith('ERROR:'):
                continue
            
            eval_count += 1
            print_status(f"   [{eval_count}/{len(processed_indices)}] Evaluating with {model}...", "info")
            
            # Evaluate with AI
            if expected and expected.lower() != 'nan':
                eval_result = evaluate_response_with_ai(question, expected, actual, gemini_api_key, model=model)
                
                if eval_result["success"]:
                    model_df.at[idx, 'eval_score'] = eval_result["score"]
                    model_df.at[idx, 'eval_reasoning'] = eval_result["reasoning"]
                    
                    # Add detailed scores if available
                    if 'factual_accuracy' in eval_result:
                        model_df.at[idx, 'factual_accuracy'] = eval_result['factual_accuracy']
                    if 'completeness' in eval_result:
                        model_df.at[idx, 'completeness'] = eval_result['completeness']
                    if 'relevance' in eval_result:
                        model_df.at[idx, 'relevance'] = eval_result['relevance']
                    if 'clarity' in eval_result:
                        model_df.at[idx, 'clarity'] = eval_result['clarity']
                    
                    score = eval_result["score"]
                    status = "success" if score >= 70 else "warning" if score >= 50 else "error"
                    print_status(f"      📊 Score: {score}/100", status)
                else:
                    print_status(f"      ⚠️  Evaluation failed: {eval_result['reasoning']}", "warning")
            
            # Small delay between evaluations to avoid rate limiting
            time.sleep(0.5)
        
        # Calculate summary statistics
        successful_responses = model_df[
            (model_df[actual_col].notna()) & 
            (model_df[actual_col].astype(str).str.len() > 0) &
            (~model_df[actual_col].astype(str).str.startswith('ERROR:'))
        ]
        evaluated_responses = model_df[model_df['eval_score'] > 0]
        
        summary_stats = []
        summary_stats.append(f"Evaluation Model: {model}")
        summary_stats.append(f"Total Questions: {len(model_df)}")
        summary_stats.append(f"Processed Questions: {processed_count}")
        summary_stats.append(f"Successful Responses: {len(successful_responses)}")
        summary_stats.append(f"Evaluated Responses: {len(evaluated_responses)}")
        
        if len(successful_responses) > 0:
            avg_latency = successful_responses['latency'].mean()
            summary_stats.append(f"Average Latency: {avg_latency:.2f}s")
        else:
            summary_stats.append("Average Latency: N/A")
            
        summary_stats.append("")  # Empty line
        
        if len(evaluated_responses) > 0:
            avg_score = evaluated_responses['eval_score'].mean()
            max_score = evaluated_responses['eval_score'].max()
            min_score = evaluated_responses['eval_score'].min()
            
            summary_stats.append(f"Average Score: {avg_score:.1f}/100")
            summary_stats.append(f"Highest Score: {max_score:.1f}/100")
            summary_stats.append(f"Lowest Score: {min_score:.1f}/100")
            
            summary_stats.append("")  # Empty line
            
            # Score distribution
            fully_correct = len(evaluated_responses[evaluated_responses['eval_score'] == 100])
            excellent = len(evaluated_responses[evaluated_responses['eval_score'] >= 80])
            good = len(evaluated_responses[(evaluated_responses['eval_score'] >= 60) & (evaluated_responses['eval_score'] < 80)])
            fair = len(evaluated_responses[(evaluated_responses['eval_score'] >= 40) & (evaluated_responses['eval_score'] < 60)])
            poor = len(evaluated_responses[evaluated_responses['eval_score'] < 40])
            
            summary_stats.append("Score Distribution:")
            summary_stats.append(f"- Fully Correct (100): {fully_correct}")
            summary_stats.append(f"- Excellent (80-100): {excellent}")
            summary_stats.append(f"- Good (60-79): {good}")
            summary_stats.append(f"- Fair (40-59): {fair}")
            summary_stats.append(f"- Poor (0-39): {poor}")
        else:
            summary_stats.append("Average Score: N/A")
            summary_stats.append("Highest Score: N/A")
            summary_stats.append("Lowest Score: N/A")

        # Prepare the summary column
        if len(model_df) < len(summary_stats):
            extra_rows = len(summary_stats) - len(model_df)
            empty_rows = pd.DataFrame([{col: "" for col in model_df.columns} for _ in range(extra_rows)])
            model_df = pd.concat([model_df, empty_rows], ignore_index=True)
        
        summary_column_data = [""] * len(model_df)
        for i, stat in enumerate(summary_stats):
            summary_column_data[i] = stat
            
        model_df.insert(0, 'SUMMARY STATISTICS', summary_column_data)
        
        # Determine output path for this model
        if output_path and len(models) == 1:
            model_output_path = output_path
        else:
            base_path = Path(file_path)
            model_output_path = base_path.parent / f"{model}-output.csv"
        
        # Save results
        print_status(f"\n   💾 Saving results to: {model_output_path}", "info")
        
        try:
            model_df.to_csv(model_output_path, index=False, encoding='utf-8')
            output_files.append(model_output_path)
            print_status(f"   ✅ Results saved successfully!", "success")
        except Exception as e:
            print_status(f"   ❌ Error saving results: {e}", "error")
        
        # Print summary statistics to console
        print_status(f"\n   📈 Summary for {model}:", "header")
        if len(evaluated_responses) > 0:
            print(f"      Average Score: {avg_score:.1f}/100")
            print(f"      Highest: {max_score:.1f} | Lowest: {min_score:.1f}")
        else:
            print(f"      No evaluations completed")
    
    # ========================================
    # FINAL SUMMARY
    # ========================================
    print_status("\n" + "=" * 60, "header")
    print_status("  ALL EVALUATIONS COMPLETE", "header")
    print_status("=" * 60, "header")
    
    print_status(f"\n✅ Generated {len(output_files)} output file(s):", "success")
    for output_file in output_files:
        print_status(f"   - {output_file}", "info")
    
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
  # Run tests - calls API once, then evaluates with all 3 models and creates 3 output files
  python test_global_chat.py question-answer-ifsca.csv
  # Output files:
  #   - gemini-2.0-flash-output.csv
  #   - gemini-2.5-flash-output.csv
  #   - gemini-3-flash-preview-output.csv
  
  # Create an example template
  python test_global_chat.py --create-template

  # Use only a single model (creates 1 output file)
  python test_global_chat.py test_questions.xlsx --single-model gemini-2.0-flash

  # Use specific models (creates 2 output files)
  python test_global_chat.py test_questions.xlsx --models gemini-2.0-flash gemini-2.5-flash

  # Add delay between requests (useful for rate limiting)
  python test_global_chat.py test_questions.xlsx --delay 2.0

How it works:
  1. PHASE 1: Sends all questions to the chat API ONCE and collects responses
  2. PHASE 2: Evaluates all responses using EACH specified model
  3. Creates separate output CSV files for each model's evaluation

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
        help='Output file path (default: {model}-output.csv for each model)'
    )
    parser.add_argument(
        '--models',
        nargs='+',
        default=EVALUATION_MODELS,
        help=f'Gemini models to use for evaluation (default: {", ".join(EVALUATION_MODELS)})'
    )
    parser.add_argument(
        '--single-model',
        type=str,
        help='Use only a single model for evaluation (overrides --models)'
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
    
    # Determine which models to use
    if args.single_model:
        models_to_use = [args.single_model]
    else:
        models_to_use = args.models
    
    print_status(f"\n📋 Will evaluate using {len(models_to_use)} model(s): {', '.join(models_to_use)}", "info")
    
    # Process the file (API calls once, then evaluate with all models)
    try:
        process_file(
            file_path=args.input_file,
            session_token=session_token,
            gemini_api_key=gemini_api_key,
            output_path=args.output,
            delay_seconds=args.delay,
            models=models_to_use
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
