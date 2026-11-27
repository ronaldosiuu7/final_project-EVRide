from unittest.mock import MagicMock

import bcrypt
import pytest
from sqlalchemy.exc import SQLAlchemyError

from app.bootstrap_manager import BootstrapError, create_initial_manager, validate_details


@pytest.mark.parametrize('name,email,password', [
    (' ', 'a@example.com', 'valid-password'),
    ('Manager', 'bad-email', 'valid-password'),
    ('Manager', 'a@example.com', 'short'),
    ('Manager', 'a@example.com', 'a' * 73),
    ('Manager', 'a@example.com', 'ế' * 25),
])
def test_invalid_input(name, email, password):
    with pytest.raises(BootstrapError):
        validate_details(name, email, password)


def details():
    return validate_details(' Manager ', ' MANAGER@EXAMPLE.COM ', ' valid-password ')


def factory_with_results(results):
    factory = MagicMock()
    db = factory.begin.return_value.__enter__.return_value
    db.scalar.side_effect = results
    return factory, db


@pytest.mark.parametrize('results', [[1], [None, 2]])
def test_existing_manager_or_email_refuses_without_writes(results):
    factory, db = factory_with_results(results)
    with pytest.raises(BootstrapError):
        create_initial_manager(factory, details(), lambda p: 'hash')
    db.add.assert_not_called()
    db.flush.assert_not_called()
    assert 'LOCK TABLE users' in str(db.execute.call_args.args[0])
    assert db.method_calls[0][0] == 'execute'
    assert factory.begin.return_value.__exit__.call_args.args[0] is BootstrapError


def test_success_normalizes_fields_and_preserves_password():
    factory, db = factory_with_results([None, None])
    def assign_id():
        db.add.call_args.args[0].id = 42
    db.flush.side_effect = assign_id
    hash_fn = lambda p: bcrypt.hashpw(p.encode(), bcrypt.gensalt()).decode()
    assert create_initial_manager(factory, details(), hash_fn) == 42
    user = db.add.call_args.args[0]
    assert (user.name, user.email, user.role, user.status) == (
        'Manager', 'manager@example.com', 'MANAGER', 'ACTIVE')
    assert bcrypt.checkpw(b' valid-password ', user.password.encode())
    assert user.password != ' valid-password '
    factory.begin.return_value.__exit__.assert_called_once_with(None, None, None)


def test_commit_failure_is_not_success():
    factory, db = factory_with_results([None, None])
    factory.begin.return_value.__exit__.side_effect = SQLAlchemyError('commit failed')
    with pytest.raises(SQLAlchemyError):
        create_initial_manager(factory, details(), lambda p: 'hash')
