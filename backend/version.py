import os

__version__ = "0.3.0"


def get_display_version() -> str:
    branch = os.environ.get("GIT_BRANCH", "unknown")
    sha = os.environ.get("GIT_SHA", "unknown")[:7]

    if branch == "main" or branch.startswith("v"):
        return f"v{__version__}"
    elif branch == "unknown" and sha == "unknown":
        return f"v{__version__}-local"
    else:
        return f"v{__version__}-dev ({sha})"


def get_build_info() -> dict:
    branch = os.environ.get("GIT_BRANCH", "unknown")
    sha = os.environ.get("GIT_SHA", "unknown")[:7]
    full_sha = os.environ.get("GIT_SHA", "unknown")
    is_dev = branch != "main" and not branch.startswith("v")
    return {
        "version": __version__,
        "branch": branch,
        "sha": sha,
        "full_sha": full_sha,
        "is_dev": is_dev,
    }
