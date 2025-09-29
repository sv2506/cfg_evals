from fastapi.testclient import TestClient
from app.main import app

client = TestClient(app)

def test_query_success():
    resp = client.post('/query', json={'text': 'Hello World'})
    assert resp.status_code == 200
    data = resp.json()
    assert data['received'] == 'Hello World'
    assert data['length'] == len('Hello World')
    assert 'info' in data


def test_query_validation():
    # Empty text should fail validation
    resp = client.post('/query', json={'text': ''})
    assert resp.status_code == 422
