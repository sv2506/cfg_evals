from fastapi.testclient import TestClient
from app.main import app

client = TestClient(app)

def test_nl_query_basic_count_users():
    resp = client.post('/nl-query', json={'question': 'Count all users'})
    assert resp.status_code == 200, resp.text
    data = resp.json()
    assert data['sql'].lower().startswith('select')
    assert 'mock_data' in data['sql'].lower()
    assert data['mocked'] is True


def test_nl_query_sum_balance_last_24_hours():
    resp = client.post('/nl-query', json={'question': 'Sum the total balance for all users in the last 24 hours'})
    assert resp.status_code == 200, resp.text
    data = resp.json()
    assert 'sum(balance)' in data['sql'].lower()
    assert isinstance(data['rows'], list)


def test_nl_query_avg_age():
    resp = client.post('/nl-query', json={'question': 'What is the average age of users?'})
    assert resp.status_code == 200, resp.text
    data = resp.json()
    assert 'avg(age)' in data['sql'].lower()


def test_nl_query_reject_short():
    resp = client.post('/nl-query', json={'question': 'Hi'})
    assert resp.status_code == 422


def test_nl_query_name_starts_with_a():
    resp = client.post('/nl-query', json={'question': 'Find all users whose name starts with A'})
    assert resp.status_code == 200, resp.text
    data = resp.json()
    assert "name ILIKE 'A%'".lower() in data['sql'].lower()


def test_nl_query_name_contains_substring():
    resp = client.post('/nl-query', json={'question': 'Find users where name contains ali'})
    assert resp.status_code == 200, resp.text
    data = resp.json()
    assert "name ilike '%ali%'" in data['sql'].lower()


def test_nl_query_country_filter():
    resp = client.post('/nl-query', json={'question': 'Show users from US'})
    assert resp.status_code == 200, resp.text
    data = resp.json()
    assert "country = 'US'".lower() in data['sql'].lower()


def test_nl_query_subscription_plan():
    resp = client.post('/nl-query', json={'question': 'List users where subscription plan pro'})
    assert resp.status_code == 200, resp.text
    data = resp.json()
    assert "subscription_plane = 'pro'" in data['sql'].lower()


def test_nl_query_limit_top_n():
    resp = client.post('/nl-query', json={'question': 'Show the first 5 users'})
    assert resp.status_code == 200, resp.text
    data = resp.json()
    assert data['sql'].strip().lower().endswith('limit 5')
