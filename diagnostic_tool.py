import json, time, sys
import requests

BASE = 'http://127.0.0.1:8000'

def post_chat(session_id, message):
    payload = {'message': message}
    if session_id:
        payload['session_id'] = str(session_id)
    resp = requests.post(f'{BASE}/chat', json=payload)
    resp.raise_for_status()
    return resp.json()

def get_logs(session_id):
    resp = requests.get(f'{BASE}/chat/{session_id}/logs')
    resp.raise_for_status()
    return resp.json()

def run_flow():
    # Step 1: initial request
    r1 = post_chat(None, 'I want to request a refund')
    sid = r1['session_id']
    # Step 2: name
    r2 = post_chat(sid, 'Simran Gill')
    # Step 3: order
    r3 = post_chat(sid, 'ORD-1014')
    # Step 4: confirmation
    r4 = post_chat(sid, 'Yes')
    # Fetch logs
    logs = get_logs(sid)
    print(json.dumps({'session_id': sid, 'logs': logs}, indent=2))

if __name__ == '__main__':
    run_flow()
