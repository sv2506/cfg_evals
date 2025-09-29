import json, re, sys
from pathlib import Path
from fastapi.testclient import TestClient
from app.main import app

client = TestClient(app)

def run():
    dataset_path = Path(__file__).parent / 'dataset.jsonl'
    cases = [json.loads(l) for l in dataset_path.read_text().splitlines() if l.strip()]
    results = []
    passed = 0
    for case in cases:
        r = client.post('/nl-query', json={'question': case['question']})
        if r.status_code != 200:
            results.append({"id": case['id'], "status": "error", "detail": r.text})
            continue
        data = r.json()
        sql = data['sql']
        ok = re.search(case['expect_sql_regex'], sql, re.IGNORECASE) is not None
        row_ok = isinstance(data.get('rows'), list)
        status = 'pass' if ok and row_ok else 'fail'
        if status == 'pass':
            passed += 1
        results.append({
            'id': case['id'],
            'status': status,
            'sql': sql,
            'rows': data.get('rows'),
            'mocked': data.get('mocked'),
        })
    print(json.dumps({
        'summary': {'total': len(cases), 'passed': passed, 'failed': len(cases)-passed},
        'results': results
    }, indent=2))
    return 0 if passed == len(cases) else 1

if __name__ == '__main__':
    sys.exit(run())
