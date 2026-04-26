"""Unit tests for password_utils.validate_password_strength."""
import pytest
from password_utils import validate_password_strength


def test_valid_password():
    assert validate_password_strength("Correct$Horse9!") == []


def test_too_short():
    errors = validate_password_strength("Short1!")
    assert any("12 characters" in e for e in errors)


def test_no_uppercase():
    errors = validate_password_strength("nouppercase1!!")
    assert any("uppercase" in e for e in errors)


def test_no_lowercase():
    errors = validate_password_strength("NOLOWERCASE1!!")
    assert any("lowercase" in e for e in errors)


def test_no_digit():
    errors = validate_password_strength("NoDigitHere!!")
    assert any("digit" in e for e in errors)


def test_no_special():
    errors = validate_password_strength("NoSpecialChar1")
    assert any("special" in e for e in errors)


def test_contains_identifier():
    errors = validate_password_strength("user@example.comABC1!", identifier="user@example.com")
    assert any("username" in e or "email" in e for e in errors)


def test_identifier_case_insensitive():
    errors = validate_password_strength("USER@EXAMPLE.COMabc1!", identifier="user@example.com")
    assert any("username" in e or "email" in e for e in errors)


def test_multiple_failures():
    errors = validate_password_strength("short")
    assert len(errors) >= 4


@pytest.mark.parametrize("special", ["!", "@", "#", "$", "%", "^", "&", "*", "-", "_"])
def test_accepted_special_chars(special):
    pw = f"ValidPass1{special}"
    errors = validate_password_strength(pw)
    assert not any("special" in e for e in errors)
