"""Fixture PDF bersama (dibangkitkan, bukan berkas biner di git)."""

import pytest

from tools import make_fixtures as mk


@pytest.fixture(scope="session")
def pdf_normal():
    return mk.pdf_normal(3)


@pytest.fixture(scope="session")
def pdf_corrupt():
    return mk.pdf_corrupt()


@pytest.fixture(scope="session")
def pdf_encrypted():
    return mk.pdf_encrypted()


@pytest.fixture(scope="session")
def pdf_200():
    return mk.pdf_many(200)


@pytest.fixture(scope="session")
def pdf_201():
    return mk.pdf_many(201)


@pytest.fixture(scope="session")
def pdf_scan():
    return mk.pdf_scan()
