"""
Parallel World Backend - Flask application factory
"""

import os
import warnings

# Suppress multiprocessing resource_tracker warnings (from third-party libraries like transformers)
# Must be set before all other imports
warnings.filterwarnings("ignore", message=".*resource_tracker.*")

from flask import Flask, request
from flask_cors import CORS
from sqlalchemy import text

from .config import Config
from .utils.logger import setup_logger, get_logger


def create_app(config_class=Config):
    """Flask application factory function"""
    app = Flask(__name__)
    app.config.from_object(config_class)

    # Set JSON encoding: ensure Chinese characters display directly (not \uXXXX format)
    # Flask >= 2.3 uses app.json.ensure_ascii, older versions use JSON_AS_ASCII config
    if hasattr(app, 'json') and hasattr(app.json, 'ensure_ascii'):
        app.json.ensure_ascii = False
    
    # Setup logging
    logger = setup_logger('parallelworld')

    # Only print startup info in reloader subprocess (avoid printing twice in debug mode)
    is_reloader_process = os.environ.get('WERKZEUG_RUN_MAIN') == 'true'
    debug_mode = app.config.get('DEBUG', False)
    should_log_startup = not debug_mode or is_reloader_process
    
    if should_log_startup:
        logger.info("=" * 50)
        logger.info("Parallel World Backend starting...")
        logger.info("=" * 50)
    
    # Enable CORS
    CORS(app, resources={r"/api/*": {"origins": "*"}})

    # Initialize database (create tables)
    from .models.graph_db import init_db
    try:
        init_db()
        if should_log_startup:
            logger.info("Database initialization complete")
    except Exception as e:
        logger.error(f"Database initialization failed: {e}")
        if should_log_startup:
            logger.error("Please ensure PostgreSQL is running: docker compose up -d postgres")

    # Register simulation process cleanup function (ensure all simulation processes are terminated on server shutdown)
    from .services.simulation_runner import SimulationRunner
    SimulationRunner.register_cleanup()
    if should_log_startup:
        logger.info("Simulation process cleanup function registered")

    # Request logging middleware
    @app.before_request
    def log_request():
        logger = get_logger('parallelworld.request')
        logger.debug(f"Request: {request.method} {request.path}")
        if request.content_type and 'json' in request.content_type:
            logger.debug(f"Request body: {request.get_json(silent=True)}")
    
    @app.after_request
    def log_response(response):
        logger = get_logger('parallelworld.request')
        logger.debug(f"Response: {response.status_code}")
        return response
    
    # Register blueprints
    from .api import graph_bp, simulation_bp, report_bp
    app.register_blueprint(graph_bp, url_prefix='/api/graph')
    app.register_blueprint(simulation_bp, url_prefix='/api/simulation')
    app.register_blueprint(report_bp, url_prefix='/api/report')
    
    # Health check
    @app.route('/health')
    def health():
        try:
            from .models.graph_db import get_db_session
            with next(get_db_session()) as session:
                session.execute(text("SELECT 1"))
            return {'status': 'ok', 'service': 'Parallel World Backend', 'database': 'connected'}
        except Exception as e:
            return {'status': 'error', 'service': 'Parallel World Backend', 'database': 'disconnected', 'error': str(e)}, 503
    
    if should_log_startup:
        logger.info("Parallel World Backend started successfully")
    
    return app

