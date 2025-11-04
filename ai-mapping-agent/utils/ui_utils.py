from __future__ import annotations

from typing import List
import streamlit as st

STEPS: List[str] = [
    "Upload File",
    "Map Accounts",
    "Review Results",
    "Finalize",
]


def compute_current_step() -> int:
    """Return the active step index from Streamlit session state."""
    return int(st.session_state.get("current_step", 0))


def render_progress(step: int) -> None:
    """Render a simple progress indicator based on the current step."""
    progress = (step + 1) / len(STEPS)
    st.write(f"Step {step + 1} of {len(STEPS)}")
    st.progress(progress)
