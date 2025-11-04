from utils.ui_utils import render_progress, compute_current_step, STEPS


def main() -> None:
    step = compute_current_step()
    render_progress(step)


if __name__ == "__main__":
    main()
