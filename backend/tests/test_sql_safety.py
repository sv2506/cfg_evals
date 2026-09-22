import pytest

from app.services.nl_to_sql import validate_sql


def test_accepts_allowlisted_select():
    sql = "SELECT count(*) FROM default.MOCK_DATA"
    assert validate_sql(sql) == sql


@pytest.mark.parametrize(
    "sql",
    [
        "DELETE FROM default.MOCK_DATA",
        "SELECT * FROM system.users",
        "SELECT * FROM default.MOCK_DATA; DROP TABLE default.MOCK_DATA",
        "SELECT * FROM default.MOCK_DATA JOIN system.users USING id",
        "SELECT * FROM default.MOCK_DATA -- bypass",
    ],
)
def test_rejects_queries_outside_allowlist(sql):
    with pytest.raises(ValueError):
        validate_sql(sql)
