-- Create computation_results table for storing async computation results

CREATE TABLE IF NOT EXISTS computation_results (
    id SERIAL PRIMARY KEY,
    request_id VARCHAR(255) UNIQUE NOT NULL,
    correlation_id VARCHAR(255) NOT NULL,
    status VARCHAR(20) NOT NULL,
    result_data TEXT,
    computed_at TIMESTAMP WITH TIME ZONE NOT NULL,
    processing_time_ms INTEGER,
    error_message TEXT,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
    
    CONSTRAINT check_status CHECK (status IN ('SUCCESS', 'ERROR', 'TIMEOUT'))
);

-- Indexes
CREATE INDEX IF NOT EXISTS idx_computation_results_request_id ON computation_results(request_id);
CREATE INDEX IF NOT EXISTS idx_computation_results_correlation_id ON computation_results(correlation_id);
CREATE INDEX IF NOT EXISTS idx_computation_results_computed_at ON computation_results(computed_at);
CREATE INDEX IF NOT EXISTS idx_computation_results_status ON computation_results(status);

