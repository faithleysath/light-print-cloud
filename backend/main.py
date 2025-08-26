import os
import subprocess
from flask import Flask, request, jsonify, send_from_directory, render_template
from flask_cors import CORS
import cups

# --- Configuration ---
UPLOAD_FOLDER = 'uploads'
CONVERT_FOLDER = 'converts'
ALLOWED_EXTENSIONS = {'pdf', 'txt', 'png', 'jpg', 'jpeg', 'gif', 'doc', 'docx'}

# --- App Initialization ---
app = Flask(__name__, static_folder='static', template_folder='templates')
app.config['UPLOAD_FOLDER'] = UPLOAD_FOLDER
app.config['CONVERT_FOLDER'] = CONVERT_FOLDER
# In production, CORS is not strictly necessary if the frontend is served by Flask,
# but it's kept for flexibility during development.
CORS(app, resources={r"/api/*": {"origins": "*"}})

# --- Helper Functions ---
def allowed_file(filename):
    return '.' in filename and \
           filename.rsplit('.', 1)[1].lower() in ALLOWED_EXTENSIONS

def ensure_dir(directory):
    if not os.path.exists(directory):
        os.makedirs(directory)

# --- API Routes ---
@app.route('/api/printers', methods=['GET'])
def get_printers():
    """Returns a list of available CUPS printers."""
    try:
        conn = cups.Connection()
        printers = conn.getPrinters()
        # Returning a list of printer names
        return jsonify(list(printers.keys()))
    except RuntimeError:
        # Fallback for environments without a running CUPS server
        print("CUPS connection failed. Returning dummy printer list.")
        return jsonify(["dummy_printer_1", "dummy_printer_2"])
    except Exception as e:
        print(f"An unexpected error occurred: {e}")
        return jsonify({"error": "An unexpected error occurred while fetching printers."}), 500

@app.route('/api/printers/<path:printer_name>/options', methods=['GET'])
def get_printer_options(printer_name):
    """Gets the supported options for a specific printer."""
    try:
        conn = cups.Connection()
        # Ensure the printer exists before getting attributes
        printers = conn.getPrinters()
        if printer_name not in printers:
            return jsonify({"error": "Printer not found."}), 404
            
        attrs = conn.getPrinterAttributes(printer_name)
        
        # Extracting common useful options
        # Note: The keys like "media-supported" might vary slightly between CUPS versions/drivers.
        # These are common IPP attribute names.
        options = {
            "media_supported": attrs.get("media-supported", []),
            "print_quality_supported": attrs.get("print-quality-supported", []),
            # "sides_supported": attrs.get("sides-supported", []), # As per user feedback, we will handle duplex manually
            "color_supported": attrs.get("print-color-mode-supported", [])
        }

        # The value for 'print-quality-supported' is often an integer enum.
        # We can provide a mapping to human-readable names.
        quality_map = {3: 'draft', 4: 'normal', 5: 'high'}
        if options["print_quality_supported"]:
            options["print_quality_supported"] = [quality_map.get(q, 'unknown') for q in options["print_quality_supported"]]

        return jsonify(options)
    except RuntimeError as e:
        print(f"CUPS connection failed while getting options: {e}")
        return jsonify({"error": "Could not connect to CUPS to get printer options."}), 500
    except Exception as e:
        print(f"An unexpected error occurred while getting printer options: {e}")
        return jsonify({"error": f"An unexpected error occurred: {e}"}), 500


@app.route('/api/print', methods=['POST'])
def print_document():
    """Handles the print request."""
    if 'file' not in request.files:
        return jsonify({"error": "No file part"}), 400
    
    file = request.files['file']
    printer_name = request.form.get('printer')
    copies = int(request.form.get('copies', 1))
    # Get additional print options from the form
    page_range = request.form.get('page_range')
    paper_size = request.form.get('paper_size', 'A4') # Default to A4
    color_mode = request.form.get('color_mode', 'color') # Default to color

    if file.filename == '':
        return jsonify({"error": "No selected file"}), 400
    if not printer_name:
        return jsonify({"error": "No printer selected"}), 400

    if file and allowed_file(file.filename):
        filename = file.filename
        upload_path = os.path.join(app.config['UPLOAD_FOLDER'], filename)
        file.save(upload_path)

        file_to_print = upload_path
        file_ext = filename.rsplit('.', 1)[1].lower()

        # Convert if necessary
        if file_ext in ['doc', 'docx']:
            try:
                pdf_filename = os.path.splitext(filename)[0] + '.pdf'
                pdf_path = os.path.join(app.config['CONVERT_FOLDER'], pdf_filename)
                subprocess.run(
                    ['libreoffice', '--headless', '--convert-to', 'pdf', '--outdir', app.config['CONVERT_FOLDER'], upload_path],
                    check=True
                )
                file_to_print = pdf_path
            except (subprocess.CalledProcessError, FileNotFoundError) as e:
                print(f"Conversion failed during print request: {e}")
                return jsonify({"error": "Failed to convert document for printing."}), 500

        # Submit to CUPS
        try:
            conn = cups.Connection()
            printers = conn.getPrinters()
            if printer_name not in printers:
                return jsonify({"error": f"Printer '{printer_name}' not found."}), 404
            
            # Build the options dictionary for CUPS
            print_options = {
                'copies': str(copies),
                'media': paper_size,
                'print-color-mode': color_mode
            }
            if page_range:
                # CUPS expects 'page-ranges' for specifying pages
                print_options['page-ranges'] = page_range
            
            job_id = conn.printFile(printer_name, file_to_print, f"WebApp Print - {filename}", print_options)
            return jsonify({"status": "success", "job_id": job_id})

        except RuntimeError as e:
            print(f"CUPS connection failed during print: {e}")
            # In a no-CUPS environment, we can't proceed.
            return jsonify({"error": "Could not connect to CUPS printing service."}), 500
        except Exception as e:
            print(f"An unexpected error occurred during printing: {e}")
            return jsonify({"error": "An unexpected error occurred during printing."}), 500

    return jsonify({"error": "File type not allowed"}), 400


@app.route('/api/preview', methods=['POST'])
def preview_document():
    """Handles file upload, converts DOCX to PDF, and returns the path for preview."""
    if 'file' not in request.files:
        return jsonify({"error": "No file part"}), 400
    file = request.files['file']
    if file.filename == '':
        return jsonify({"error": "No selected file"}), 400

    if file and allowed_file(file.filename):
        filename = file.filename
        upload_path = os.path.join(app.config['UPLOAD_FOLDER'], filename)
        file.save(upload_path)

        file_ext = filename.rsplit('.', 1)[1].lower()

        if file_ext in ['doc', 'docx']:
            # Convert to PDF using LibreOffice
            try:
                subprocess.run(
                    ['libreoffice', '--headless', '--convert-to', 'pdf', '--outdir', app.config['CONVERT_FOLDER'], upload_path],
                    check=True
                )
                pdf_filename = os.path.splitext(filename)[0] + '.pdf'
                # The converted file will be in the CONVERT_FOLDER
                return jsonify({"preview_path": f"/api/converted/{pdf_filename}"})
            except subprocess.CalledProcessError as e:
                print(f"Error during conversion: {e}")
                return jsonify({"error": "Failed to convert document to PDF."}), 500
            except FileNotFoundError:
                print("LibreOffice not found. Please ensure it is installed and in the system's PATH.")
                return jsonify({"error": "File conversion utility not found on server."}), 500
        
        # For PDFs, we can preview them directly from the uploads folder
        elif file_ext == 'pdf':
            return jsonify({"preview_path": f"/api/uploads/{filename}"})
        
        # For other file types, we don't have a preview handler yet
        else:
            return jsonify({"error": "Preview for this file type is not supported."}), 400

    return jsonify({"error": "File type not allowed"}), 400


@app.route('/api/uploads/<path:filename>')
def get_uploaded_file(filename):
    """Serves uploaded files."""
    return send_from_directory(app.config['UPLOAD_FOLDER'], filename)


@app.route('/api/converted/<path:filename>')
def get_converted_file(filename):
    """Serves converted PDF files."""
    return send_from_directory(app.config['CONVERT_FOLDER'], filename)


@app.route('/api/jobs/<int:job_id>', methods=['GET'])
def get_job_status(job_id):
    """Gets the status of a print job."""
    try:
        conn = cups.Connection()
        jobs = conn.getJobs(which_jobs='all', my_jobs=False) # Check all jobs on the server

        if job_id in jobs:
            job_attributes = jobs[job_id]
            job_state = job_attributes.get('job-state')
            state_reasons = job_attributes.get('job-state-reasons', 'none')

            # CUPS job states: 3=pending, 4=pending-held, 5=processing, 6=processing-stopped, 7=canceled, 8=aborted, 9=completed
            status_map = {
                3: 'pending',
                4: 'pending-held',
                5: 'processing',
                6: 'processing-stopped',
                7: 'canceled',
                8: 'aborted',
                9: 'completed'
            }
            status_str = status_map.get(job_state, 'unknown')
            
            return jsonify({
                "job_id": job_id,
                "status": status_str,
                "reasons": state_reasons
            })
        else:
            # If the job is not in the active list, it might be completed and cleared.
            # We'll assume it's completed if we can't find it.
            return jsonify({"job_id": job_id, "status": "completed", "reasons": "not-found-in-active-jobs"})

    except RuntimeError as e:
        print(f"CUPS connection failed during job status check: {e}")
        return jsonify({"error": "Could not connect to CUPS to check job status."}), 500
    except Exception as e:
        print(f"An unexpected error occurred during job status check: {e}")
        return jsonify({"error": "An unexpected error occurred while checking job status."}), 500

# --- Frontend Serving ---
@app.route('/', defaults={'path': ''})
@app.route('/<path:path>')
def serve(path):
    """Serves the frontend application."""
    # Let the API routes handle themselves
    if path != "" and os.path.exists(os.path.join(app.static_folder, path)):
        return send_from_directory(app.static_folder, path)
    # For any other path, serve the main index.html
    else:
        return render_template("index.html")

# --- Main Execution ---
if __name__ == '__main__':
    ensure_dir(UPLOAD_FOLDER)
    ensure_dir(CONVERT_FOLDER)
    # Set debug=False for production serving
    app.run(host='0.0.0.0', port=5000, debug=False)
