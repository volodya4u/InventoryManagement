CREATE TABLE IF NOT EXISTS app_user (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    username TEXT NOT NULL UNIQUE COLLATE NOCASE,
    password_hash TEXT NOT NULL,
    role TEXT NOT NULL CHECK (role = 'ADMIN'),
    enabled INTEGER NOT NULL DEFAULT 1 CHECK (enabled IN (0, 1)),
    created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
);

CREATE TABLE IF NOT EXISTS raw_material (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    name TEXT NOT NULL COLLATE NOCASE,
    description TEXT NOT NULL DEFAULT '',
    unit TEXT NOT NULL,
    quantity NUMERIC NOT NULL DEFAULT 0 CHECK (quantity >= 0),
    average_unit_cost NUMERIC NOT NULL DEFAULT 0 CHECK (average_unit_cost >= 0),
    image BLOB,
    image_content_type TEXT,
    created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
    updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
);

CREATE INDEX IF NOT EXISTS idx_raw_material_name ON raw_material(name);

CREATE TABLE IF NOT EXISTS raw_material_stock_movement (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    raw_material_id INTEGER NOT NULL,
    movement_type TEXT NOT NULL CHECK (movement_type IN (
        'OPENING_BALANCE', 'RECEIPT', 'PRODUCTION_CONSUMPTION',
        'WRITE_OFF', 'ADJUSTMENT_INCREASE', 'ADJUSTMENT_DECREASE'
    )),
    quantity NUMERIC NOT NULL CHECK (quantity > 0),
    unit_cost NUMERIC NOT NULL CHECK (unit_cost >= 0),
    total_cost NUMERIC NOT NULL CHECK (total_cost >= 0),
    occurred_at TEXT NOT NULL,
    notes TEXT NOT NULL DEFAULT '',
    created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
    FOREIGN KEY (raw_material_id) REFERENCES raw_material(id) ON DELETE CASCADE
);

CREATE INDEX IF NOT EXISTS idx_raw_material_stock_movement_material
    ON raw_material_stock_movement(raw_material_id, occurred_at);

CREATE TABLE IF NOT EXISTS product (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    sku TEXT NOT NULL UNIQUE COLLATE NOCASE,
    name TEXT NOT NULL COLLATE NOCASE,
    description TEXT NOT NULL DEFAULT '',
    quantity NUMERIC NOT NULL DEFAULT 0 CHECK (quantity >= 0),
    price NUMERIC NOT NULL DEFAULT 0 CHECK (price >= 0),
    markup_percentage NUMERIC NOT NULL DEFAULT 0 CHECK (markup_percentage >= 0),
    average_unit_cost NUMERIC NOT NULL DEFAULT 0 CHECK (average_unit_cost >= 0),
    image BLOB,
    image_content_type TEXT,
    created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
    updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
);

CREATE INDEX IF NOT EXISTS idx_product_name ON product(name);

CREATE TABLE IF NOT EXISTS product_recipe_item (
    product_id INTEGER NOT NULL,
    raw_material_id INTEGER NOT NULL,
    quantity_per_unit NUMERIC NOT NULL CHECK (quantity_per_unit > 0),
    PRIMARY KEY (product_id, raw_material_id),
    FOREIGN KEY (product_id) REFERENCES product(id) ON DELETE CASCADE,
    FOREIGN KEY (raw_material_id) REFERENCES raw_material(id) ON DELETE RESTRICT
);

CREATE INDEX IF NOT EXISTS idx_product_recipe_item_material
    ON product_recipe_item(raw_material_id);

CREATE TABLE IF NOT EXISTS production_batch (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    product_id INTEGER NOT NULL,
    quantity NUMERIC NOT NULL CHECK (quantity > 0),
    unit_cost NUMERIC NOT NULL CHECK (unit_cost >= 0),
    total_cost NUMERIC NOT NULL CHECK (total_cost >= 0),
    produced_at TEXT NOT NULL,
    notes TEXT NOT NULL DEFAULT '',
    created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
    FOREIGN KEY (product_id) REFERENCES product(id) ON DELETE CASCADE
);

CREATE INDEX IF NOT EXISTS idx_production_batch_product
    ON production_batch(product_id, produced_at);

CREATE TABLE IF NOT EXISTS production_consumption (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    production_batch_id INTEGER NOT NULL,
    raw_material_id INTEGER NOT NULL,
    quantity NUMERIC NOT NULL CHECK (quantity > 0),
    unit_cost NUMERIC NOT NULL CHECK (unit_cost >= 0),
    total_cost NUMERIC NOT NULL CHECK (total_cost >= 0),
    FOREIGN KEY (production_batch_id) REFERENCES production_batch(id) ON DELETE CASCADE,
    FOREIGN KEY (raw_material_id) REFERENCES raw_material(id) ON DELETE RESTRICT
);

CREATE INDEX IF NOT EXISTS idx_production_consumption_batch
    ON production_consumption(production_batch_id);

CREATE TABLE IF NOT EXISTS sale (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    sale_number TEXT NOT NULL UNIQUE COLLATE NOCASE,
    sale_date TEXT NOT NULL,
    payment_method TEXT NOT NULL CHECK (payment_method IN ('CASH', 'CARD', 'BANK_TRANSFER')),
    notes TEXT NOT NULL DEFAULT '',
    total_revenue NUMERIC NOT NULL CHECK (total_revenue >= 0),
    total_cost NUMERIC NOT NULL CHECK (total_cost >= 0),
    gross_profit NUMERIC NOT NULL,
    created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
);

CREATE INDEX IF NOT EXISTS idx_sale_date ON sale(sale_date, id);

CREATE TABLE IF NOT EXISTS sale_item (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    sale_id INTEGER NOT NULL,
    product_id INTEGER NOT NULL,
    product_sku TEXT NOT NULL,
    product_name TEXT NOT NULL,
    quantity NUMERIC NOT NULL CHECK (quantity > 0),
    recommended_unit_price NUMERIC NOT NULL CHECK (recommended_unit_price >= 0),
    unit_price NUMERIC NOT NULL CHECK (unit_price >= 0),
    unit_cost NUMERIC NOT NULL CHECK (unit_cost >= 0),
    line_revenue NUMERIC NOT NULL CHECK (line_revenue >= 0),
    line_cost NUMERIC NOT NULL CHECK (line_cost >= 0),
    line_profit NUMERIC NOT NULL,
    FOREIGN KEY (sale_id) REFERENCES sale(id) ON DELETE CASCADE,
    FOREIGN KEY (product_id) REFERENCES product(id) ON DELETE RESTRICT
);

CREATE INDEX IF NOT EXISTS idx_sale_item_sale ON sale_item(sale_id);
CREATE INDEX IF NOT EXISTS idx_sale_item_product ON sale_item(product_id);

CREATE TABLE IF NOT EXISTS product_stock_movement (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    product_id INTEGER NOT NULL,
    production_batch_id INTEGER,
    sale_id INTEGER,
    movement_type TEXT NOT NULL CHECK (movement_type IN (
        'OPENING_BALANCE', 'PRODUCTION', 'SALE',
        'WRITE_OFF', 'ADJUSTMENT_INCREASE', 'ADJUSTMENT_DECREASE'
    )),
    quantity NUMERIC NOT NULL CHECK (quantity > 0),
    unit_cost NUMERIC NOT NULL CHECK (unit_cost >= 0),
    total_cost NUMERIC NOT NULL CHECK (total_cost >= 0),
    occurred_at TEXT NOT NULL,
    notes TEXT NOT NULL DEFAULT '',
    created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
    FOREIGN KEY (product_id) REFERENCES product(id) ON DELETE CASCADE,
    FOREIGN KEY (production_batch_id) REFERENCES production_batch(id) ON DELETE CASCADE,
    FOREIGN KEY (sale_id) REFERENCES sale(id) ON DELETE RESTRICT
);

CREATE INDEX IF NOT EXISTS idx_product_stock_movement_product
    ON product_stock_movement(product_id, occurred_at);
