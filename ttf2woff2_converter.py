"""Desktop GUI for converting TTF fonts to WOFF2."""

import sys
import ctypes
from pathlib import Path

from fontTools.ttLib import TTFont

from PySide6.QtCore import QObject, QThread, Qt, Signal
from PySide6.QtGui import QDragEnterEvent, QDropEvent, QIcon
from PySide6.QtWidgets import (
    QApplication,
    QCheckBox,
    QDialog,
    QFileDialog,
    QFrame,
    QHBoxLayout,
    QLabel,
    QListWidget,
    QListWidgetItem,
    QMainWindow,
    QMessageBox,
    QPushButton,
    QTextEdit,
    QVBoxLayout,
    QWidget,
)


APP_TITLE = "TTF to WOFF2 Converter"
APP_ICON = "assets/ttf2woff2-converter.ico"
ABOUT_TEXT = """TTF to WOFF2 Converter
© 2026 strailico5327

Convert TTF fonts to WOFF2.

Licensed under GNU GPLv3."""


def resource_path(relative_path: str) -> Path:
    base_path = Path(getattr(sys, "_MEIPASS", Path(__file__).resolve().parent))
    return base_path / relative_path


def enable_windows_high_dpi_awareness() -> None:
    """Improve DPI behaviour on Windows before creating QApplication."""
    if sys.platform != "win32":
        return

    try:
        ctypes.windll.user32.SetProcessDpiAwarenessContext(ctypes.c_void_p(-4))
    except Exception:
        try:
            ctypes.windll.shcore.SetProcessDpiAwareness(2)
        except Exception:
            try:
                ctypes.windll.user32.SetProcessDPIAware()
            except Exception:
                pass


def collect_ttf_files(paths: list[str]) -> list[Path]:
    files: list[Path] = []

    for raw_path in paths:
        path = Path(raw_path)

        if path.is_file() and path.suffix.lower() == ".ttf":
            files.append(path)

        elif path.is_dir():
            for item in path.rglob("*"):
                if item.is_file() and item.suffix.lower() == ".ttf":
                    files.append(item)

    seen: set[Path] = set()
    unique_files: list[Path] = []

    for file in files:
        resolved = file.resolve()
        if resolved not in seen:
            seen.add(resolved)
            unique_files.append(file)

    return unique_files


def convert_ttf_to_woff2(input_path: Path, overwrite: bool = False) -> tuple[bool, str]:
    output_path = input_path.with_suffix(".woff2")

    if output_path.exists() and not overwrite:
        return False, f"Skipped: {output_path.name} already exists"

    try:
        font = TTFont(str(input_path))
        font.flavor = "woff2"
        font.save(str(output_path))
        font.close()

        return True, f"Done: {input_path.name} → {output_path.name}"

    except Exception as error:
        return False, f"Failed: {input_path.name} | {error}"


class ConvertWorker(QObject):
    log = Signal(str)
    finished = Signal(int, int)

    def __init__(self, files: list[Path], overwrite: bool):
        super().__init__()
        self.files = files
        self.overwrite = overwrite

    def run(self) -> None:
        success_count = 0
        skipped_or_failed_count = 0

        self.log.emit(f"Starting conversion for {len(self.files)} queued TTF file(s)...")

        for file in self.files:
            success, message = convert_ttf_to_woff2(file, overwrite=self.overwrite)

            if success:
                success_count += 1
            else:
                skipped_or_failed_count += 1

            self.log.emit(message)

        self.log.emit("")
        self.log.emit(
            f"Conversion finished. Success: {success_count}, skipped/failed: {skipped_or_failed_count}"
        )
        self.log.emit("The window will remain open. You can add more files or clear the queue.")
        self.finished.emit(success_count, skipped_or_failed_count)


class DropArea(QFrame):
    files_dropped = Signal(list)

    def __init__(self):
        super().__init__()

        self.setAcceptDrops(True)
        self.setMinimumHeight(150)
        self.setObjectName("dropArea")

        layout = QVBoxLayout(self)
        layout.setAlignment(Qt.AlignmentFlag.AlignCenter)

        label = QLabel("Drop .ttf files or folders here")
        label.setAlignment(Qt.AlignmentFlag.AlignCenter)
        label.setObjectName("dropLabel")

        sub_label = QLabel("Dropped files will be added to the queue")
        sub_label.setAlignment(Qt.AlignmentFlag.AlignCenter)
        sub_label.setObjectName("dropSubLabel")

        layout.addWidget(label)
        layout.addWidget(sub_label)

    def dragEnterEvent(self, event: QDragEnterEvent) -> None:
        if event.mimeData().hasUrls():
            event.acceptProposedAction()
            self.setProperty("dragging", True)
            self.style().unpolish(self)
            self.style().polish(self)
        else:
            event.ignore()

    def dragLeaveEvent(self, event) -> None:
        self.setProperty("dragging", False)
        self.style().unpolish(self)
        self.style().polish(self)
        super().dragLeaveEvent(event)

    def dropEvent(self, event: QDropEvent) -> None:
        self.setProperty("dragging", False)
        self.style().unpolish(self)
        self.style().polish(self)

        paths: list[str] = []

        for url in event.mimeData().urls():
            if url.isLocalFile():
                paths.append(url.toLocalFile())

        if paths:
            self.files_dropped.emit(paths)
            event.acceptProposedAction()
        else:
            event.ignore()


class MainWindow(QMainWindow):
    def __init__(self):
        super().__init__()

        self.thread: QThread | None = None
        self.worker: ConvertWorker | None = None

        self.queue_files: list[Path] = []
        self.queue_set: set[Path] = set()

        self.setWindowTitle(APP_TITLE)
        self.resize(820, 640)
        self.setMinimumSize(700, 520)

        self.build_ui()
        self.apply_styles()
        self.update_queue_label()
        self.update_start_button()

        self.log("Ready. Add .ttf files/folders to the queue, then click Start conversion.")

    def build_ui(self) -> None:
        central = QWidget()
        self.setCentralWidget(central)

        main_layout = QVBoxLayout(central)
        main_layout.setContentsMargins(18, 18, 18, 18)
        main_layout.setSpacing(12)

        title = QLabel("TTF → WOFF2 Converter")
        title.setObjectName("titleLabel")

        hint = QLabel(
            "Output .woff2 files will be saved next to the original .ttf files."
        )
        hint.setObjectName("hintLabel")

        self.drop_area = DropArea()
        self.drop_area.files_dropped.connect(self.add_paths_to_queue)

        file_controls = QHBoxLayout()

        self.choose_files_button = QPushButton("Add files")
        self.choose_files_button.clicked.connect(self.choose_files)

        self.choose_folder_button = QPushButton("Add folder")
        self.choose_folder_button.clicked.connect(self.choose_folder)

        self.remove_selected_button = QPushButton("Remove selected")
        self.remove_selected_button.clicked.connect(self.remove_selected)

        self.clear_queue_button = QPushButton("Clear queue")
        self.clear_queue_button.clicked.connect(self.clear_queue)

        file_controls.addWidget(self.choose_files_button)
        file_controls.addWidget(self.choose_folder_button)
        file_controls.addStretch()
        file_controls.addWidget(self.remove_selected_button)
        file_controls.addWidget(self.clear_queue_button)

        self.queue_label = QLabel()
        self.queue_label.setObjectName("queueLabel")

        self.queue_list = QListWidget()
        self.queue_list.setSelectionMode(QListWidget.SelectionMode.ExtendedSelection)
        self.queue_list.setObjectName("queueList")

        conversion_controls = QHBoxLayout()

        self.overwrite_checkbox = QCheckBox("Overwrite existing .woff2 files")

        self.start_button = QPushButton("Start conversion")
        self.start_button.clicked.connect(self.start_conversion_from_queue)
        self.start_button.setObjectName("startButton")

        self.clear_log_button = QPushButton("Clear log")
        self.clear_log_button.clicked.connect(self.clear_log)

        conversion_controls.addWidget(self.overwrite_checkbox)
        conversion_controls.addStretch()
        conversion_controls.addWidget(self.start_button)
        conversion_controls.addWidget(self.clear_log_button)

        self.log_box = QTextEdit()
        self.log_box.setReadOnly(True)
        self.log_box.setObjectName("logBox")

        footer_controls = QHBoxLayout()
        self.about_button = QPushButton("ⓘ")
        self.about_button.setObjectName("aboutButton")
        self.about_button.setToolTip("About")
        self.about_button.clicked.connect(self.show_about)

        footer_controls.addStretch()
        footer_controls.addWidget(self.about_button)

        main_layout.addWidget(title)
        main_layout.addWidget(hint)
        main_layout.addWidget(self.drop_area)
        main_layout.addLayout(file_controls)
        main_layout.addWidget(self.queue_label)
        main_layout.addWidget(self.queue_list, stretch=2)
        main_layout.addLayout(conversion_controls)
        main_layout.addWidget(self.log_box, stretch=2)
        main_layout.addLayout(footer_controls)

    def apply_styles(self) -> None:
        self.setStyleSheet(
            """
            QWidget {
                background: palette(window);
                color: palette(window-text);
                font-family: "Segoe UI";
                font-size: 10.5pt;
            }

            QLabel {
                background: transparent;
            }

            QLabel#titleLabel {
                font-size: 22pt;
                font-weight: 700;
            }

            QLabel#hintLabel {
                color: palette(text);
            }

            QLabel#queueLabel {
                font-weight: 600;
            }

            QFrame#dropArea {
                border: 2px dashed palette(mid);
                border-radius: 12px;
                background: palette(base);
            }

            QFrame#dropArea[dragging="true"] {
                border: 2px dashed palette(highlight);
                background: palette(alternate-base);
            }

            QLabel#dropLabel {
                font-size: 18pt;
                font-weight: 600;
                color: palette(text);
            }

            QLabel#dropSubLabel {
                color: palette(text);
            }

            QListWidget#queueList {
                font-family: Consolas, "Cascadia Mono", monospace;
                font-size: 9.5pt;
            }

            QTextEdit#logBox {
                font-family: Consolas, "Cascadia Mono", monospace;
                font-size: 10pt;
            }

            QPushButton {
                padding: 6px 12px;
            }

            QPushButton#startButton {
                font-weight: 700;
            }

            QPushButton#aboutButton {
                min-width: 28px;
                max-width: 28px;
                min-height: 28px;
                max-height: 28px;
                padding: 0;
                border-radius: 14px;
                font-size: 13pt;
            }

            QCheckBox {
                spacing: 8px;
            }
            """
        )

    def choose_files(self) -> None:
        files, _ = QFileDialog.getOpenFileNames(
            self,
            "Choose TTF files",
            "",
            "TrueType Fonts (*.ttf);;All Files (*.*)",
        )

        if files:
            self.add_paths_to_queue(files)

    def choose_folder(self) -> None:
        folder = QFileDialog.getExistingDirectory(
            self,
            "Choose folder containing TTF files",
            "",
        )

        if folder:
            self.add_paths_to_queue([folder])

    def add_paths_to_queue(self, paths: list[str]) -> None:
        if self.is_conversion_running():
            QMessageBox.information(
                self,
                APP_TITLE,
                "Conversion is already running. Please wait until it finishes.",
            )
            return

        files = collect_ttf_files(paths)

        if not files:
            self.log("No .ttf files found.")
            return

        added_count = 0
        duplicate_count = 0

        for file in files:
            resolved = file.resolve()

            if resolved in self.queue_set:
                duplicate_count += 1
                continue

            self.queue_set.add(resolved)
            self.queue_files.append(file)

            item = QListWidgetItem(str(file))
            item.setToolTip(str(file))
            item.setData(Qt.ItemDataRole.UserRole, str(resolved))
            self.queue_list.addItem(item)

            added_count += 1

        self.update_queue_label()
        self.update_start_button()

        self.log(f"Added to queue: {added_count} file(s).")

        if duplicate_count:
            self.log(f"Skipped duplicate queue item(s): {duplicate_count}")

    def remove_selected(self) -> None:
        if self.is_conversion_running():
            return

        selected_items = self.queue_list.selectedItems()

        if not selected_items:
            self.log("No queue item selected.")
            return

        for item in selected_items:
            resolved = Path(item.data(Qt.ItemDataRole.UserRole))
            row = self.queue_list.row(item)

            self.queue_list.takeItem(row)
            self.queue_set.discard(resolved)

            self.queue_files = [
                file for file in self.queue_files if file.resolve() != resolved
            ]

        self.update_queue_label()
        self.update_start_button()
        self.log(f"Removed selected item(s): {len(selected_items)}")

    def clear_queue(self) -> None:
        if self.is_conversion_running():
            return

        count = len(self.queue_files)

        self.queue_files.clear()
        self.queue_set.clear()
        self.queue_list.clear()

        self.update_queue_label()
        self.update_start_button()
        self.log(f"Queue cleared. Removed {count} file(s).")

    def start_conversion_from_queue(self) -> None:
        if self.is_conversion_running():
            QMessageBox.information(
                self,
                APP_TITLE,
                "Conversion is already running.",
            )
            return

        if not self.queue_files:
            self.log("Queue is empty. Add .ttf files first.")
            return

        files = list(self.queue_files)
        overwrite = self.overwrite_checkbox.isChecked()

        self.set_controls_enabled(False)

        self.thread = QThread()
        self.worker = ConvertWorker(files, overwrite)
        self.worker.moveToThread(self.thread)

        self.thread.started.connect(self.worker.run)
        self.worker.log.connect(self.log)
        self.worker.finished.connect(self.on_conversion_finished)

        self.worker.finished.connect(self.thread.quit)
        self.worker.finished.connect(self.worker.deleteLater)

        self.thread.finished.connect(self.cleanup_thread)
        self.thread.finished.connect(self.thread.deleteLater)

        self.thread.start()

    def on_conversion_finished(self, success_count: int, skipped_or_failed_count: int) -> None:
        self.set_controls_enabled(True)
        self.update_start_button()

    def cleanup_thread(self) -> None:
        self.thread = None
        self.worker = None
        
    def is_conversion_running(self) -> bool:
        return self.thread is not None and self.thread.isRunning()

    def set_controls_enabled(self, enabled: bool) -> None:
        self.choose_files_button.setEnabled(enabled)
        self.choose_folder_button.setEnabled(enabled)
        self.remove_selected_button.setEnabled(enabled)
        self.clear_queue_button.setEnabled(enabled)
        self.overwrite_checkbox.setEnabled(enabled)
        self.clear_log_button.setEnabled(enabled)
        self.drop_area.setEnabled(enabled)
        self.drop_area.setAcceptDrops(enabled)

        self.start_button.setEnabled(enabled and bool(self.queue_files))

    def update_queue_label(self) -> None:
        self.queue_label.setText(f"Queue: {len(self.queue_files)} file(s)")

    def update_start_button(self) -> None:
        self.start_button.setEnabled(bool(self.queue_files) and not self.is_conversion_running())

    def log(self, message: str) -> None:
        self.log_box.append(message)

    def clear_log(self) -> None:
        self.log_box.clear()

    def show_about(self) -> None:
        dialog = QDialog(self)
        dialog.setWindowTitle(APP_TITLE)
        dialog.setModal(True)
        dialog.setMinimumWidth(360)

        layout = QVBoxLayout(dialog)
        layout.setContentsMargins(22, 18, 22, 18)
        layout.setSpacing(16)

        text = QLabel(ABOUT_TEXT)
        text.setAlignment(Qt.AlignmentFlag.AlignCenter)
        text.setTextInteractionFlags(Qt.TextInteractionFlag.TextSelectableByMouse)

        ok_button = QPushButton("OK")
        ok_button.clicked.connect(dialog.accept)

        button_row = QHBoxLayout()
        button_row.addStretch()
        button_row.addWidget(ok_button)
        button_row.addStretch()

        layout.addWidget(text)
        layout.addLayout(button_row)

        dialog.exec()


def main() -> None:
    enable_windows_high_dpi_awareness()

    app = QApplication(sys.argv)
    app.setApplicationName(APP_TITLE)
    app_icon = QIcon(str(resource_path(APP_ICON)))
    if not app_icon.isNull():
        app.setWindowIcon(app_icon)

    window = MainWindow()
    if not app_icon.isNull():
        window.setWindowIcon(app_icon)
    window.show()

    sys.exit(app.exec())


if __name__ == "__main__":
    main()
