import os

__version__ = "0.1.3"


def get_display_version() -> str:
    branch = os.environ.get("GIT_BRANCH", "unknown")
    sha = os.environ.get("GIT_SHA", "unknown")[:7]

    if branch == "main":
        return f"v{__version__}"
    elif branch == "unknown" and sha == "unknown":
        return f"v{__version__}-local"
    else:
        return f"v{__version__}-dev ({sha})"


def get_build_info() -> dict:
    return {
        "version": __version__,
        "branch": os.environ.get("GIT_BRANCH", "unknown"),
        "sha": os.environ.get("GIT_SHA", "unknown")[:7],
        "is_dev": os.environ.get("GIT_BRANCH", "unknown") != "main",
    }
