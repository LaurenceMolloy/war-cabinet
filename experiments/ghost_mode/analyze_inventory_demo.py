import matplotlib
matplotlib.use('Agg') # Headless mode
import sqlite3
import matplotlib.pyplot as plt
import matplotlib.patches as patches
import numpy as np
import os
import string
from datetime import datetime

def seed_mock_db(db_path):
    conn = sqlite3.connect(db_path)
    c = conn.cursor()
    curr_y = datetime.now().year
    curr_m = datetime.now().month
    
    c.executescript(f"""
        CREATE TABLE Categories (id INTEGER PRIMARY KEY, name TEXT);
        CREATE TABLE ItemTypes (id INTEGER PRIMARY KEY, name TEXT, category_id INTEGER);
        CREATE TABLE Inventory (id INTEGER PRIMARY KEY, item_type_id INTEGER, quantity REAL, expiry_month INTEGER, expiry_year INTEGER);
        
        INSERT INTO Categories (id, name) VALUES (1, 'PROTEINS'), (2, 'VEGETABLES'), (3, 'TACTICAL RATIONS'), (4, 'STARCHES');
        
        INSERT INTO ItemTypes (id, name, category_id) VALUES 
            (1, 'Chicken Breast', 1), (2, 'Ribeye Steak', 1),
            (4, 'Broccoli', 2), (5, 'Spinach', 2),
            (6, 'MRE: Chili Mac', 3), (7, 'MRE: Beef Stew', 3),
            (8, 'Basmati Rice', 4);
            
        -- PROTEINS (Mixed Expiry)
        INSERT INTO Inventory (item_type_id, quantity, expiry_month, expiry_year) VALUES 
            (1, 10, {curr_m}, {curr_y}), -- Expiring this month (RED)
            (1, 5, {(curr_m+2)%12 or 12}, {curr_y if curr_m <= 10 else curr_y+1}), -- 2 months (AMBER)
            (2, 4, {curr_m}, {curr_y+1}); -- 1 year (GREEN)

        -- VEGETABLES (Warning)
        INSERT INTO Inventory (item_type_id, quantity, expiry_month, expiry_year) VALUES 
            (4, 15, {(curr_m+5)%12 or 12}, {curr_y if curr_m <= 7 else curr_y+1}), -- 5 months (YELLOW)
            (5, 10, {(curr_m+1)%12 or 12}, {curr_y if curr_m <= 11 else curr_y+1}); -- 1 month (AMBER)

        -- RATIONS (Long Term)
        INSERT INTO Inventory (item_type_id, quantity, expiry_month, expiry_year) VALUES 
            (6, 20, {curr_m}, {curr_y+2}), -- 2 years (GREEN)
            (7, 18, {curr_m}, {curr_y+3}); -- 3 years (GREEN)

        -- STARCHES (Critical)
        INSERT INTO Inventory (item_type_id, quantity, expiry_month, expiry_year) VALUES 
            (8, 14, {(curr_m-1)%12 or 12}, {curr_y if curr_m > 1 else curr_y-1}); -- Expired (RED)
    """)
    conn.commit()
    conn.close()

def get_expiry_color(m, y):
    now = datetime.now()
    expiry = datetime(y, m, 1)
    diff_months = (expiry.year - now.year) * 12 + (expiry.month - now.month)
    
    if diff_months <= 0: return '#ff4d4d' # RED (Expired/This Month)
    if diff_months <= 3: return '#ffa64d' # AMBER (1-3m)
    if diff_months <= 6: return '#ffff4d' # YELLOW (4-6m)
    return '#4dff4d' # GREEN (>6m)

def plot_expiry_intel(db_path):
    conn = sqlite3.connect(db_path)
    # Get Categories
    cats = conn.execute("SELECT id, name FROM Categories").fetchall()
    
    # Nested Data: Cat -> ItemType -> Batches
    data_map = {}
    total_qty = 0
    
    for cat_id, cat_name in cats:
        items = conn.execute("SELECT id, name FROM ItemTypes WHERE category_id = ?", [cat_id]).fetchall()
        cat_data = []
        for it_id, it_name in items:
            batches = conn.execute("SELECT quantity, expiry_month, expiry_year FROM Inventory WHERE item_type_id = ?", [it_id]).fetchall()
            if not batches: continue
            # Sort batches by expiry date (soonest first)
            sorted_batches = sorted(batches, key=lambda b: (b[2], b[1]))
            batch_data = []
            it_qty = 0
            for qty, m, y in sorted_batches:
                batch_data.append({'qty': qty, 'color': get_expiry_color(m, y)})
                it_qty += qty
            cat_data.append({'name': it_name, 'qty': it_qty, 'batches': batch_data})
            total_qty += it_qty
        if cat_data:
            # Sort ItemTypes by qty within category (Descending)
            cat_data.sort(key=lambda x: x['qty'], reverse=True)
            data_map[cat_name] = cat_data

    # Sort Categories by total qty (Descending)
    sorted_cats = sorted(data_map.items(), key=lambda x: sum(i['qty'] for i in x[1]), reverse=True)

    # Plot Setup
    plt.style.use('dark_background')
    fig, ax = plt.subplots(figsize=(10, 10))
    fig.patch.set_facecolor('#0a0a0a')
    ax.set_facecolor('#0a0a0a')

    # Data lists for the 3 rings
    cat_counts, cat_colors, cat_labels = [], [], []
    it_counts, it_colors, it_labels = [], [], []
    batch_counts, batch_colors = [], []

    alphabet = string.ascii_uppercase
    cmaps = [plt.cm.cool, plt.cm.spring, plt.cm.winter, plt.cm.autumn]

    for i, (cat_name, item_list) in enumerate(sorted_cats):
        cat_letter = alphabet[i]
        cat_qty = sum(it['qty'] for it in item_list)
        cat_counts.append(cat_qty)
        base_color = cmaps[i % len(cmaps)](0.6)
        cat_colors.append(base_color)
        cat_labels.append(cat_letter)
        
        for j, it in enumerate(item_list):
            it_letter = f"{cat_letter}{j+1}"
            it_counts.append(it['qty'])
            alpha = 1.0 - (j * 0.15)
            it_colors.append((*base_color[:3], max(0.5, alpha)))
            it_labels.append(it_letter)
            
            for b in it['batches']:
                batch_counts.append(b['qty'])
                batch_colors.append(b['color'])

    # DRAW RINGS (Inside Out)
    # 1. Inner: Categories (Thinnest)
    ax.pie(cat_counts, labels=cat_labels, radius=0.7, colors=cat_colors,
           wedgeprops=dict(width=0.08, edgecolor='#0a0a0a'), labeldistance=0.45,
           textprops={'weight':'bold', 'fontsize': 14}, startangle=90, counterclock=False)

    # 2. Middle: Item Types
    ax.pie(it_counts, labels=it_labels, radius=1.0, colors=it_colors,
           wedgeprops=dict(width=0.25, edgecolor='#0a0a0a'), labeldistance=0.85,
           textprops={'weight':'bold', 'fontsize': 10}, startangle=90, counterclock=False)

    # 3. Outer: Batch Expiry (Sleekest)
    ax.pie(batch_counts, radius=1.12, colors=batch_colors,
           wedgeprops=dict(width=0.08, edgecolor='#0a0a0a'), startangle=90, counterclock=False)

    plt.title("WAR CABINET\nEXPIRY INTELLIGENCE HUB", pad=30, color='#00ffcc', weight='bold', size=18)
    
    output_image = 'tactical_expiry_readout.png'
    plt.savefig(output_image, bbox_inches='tight', dpi=150, facecolor='#0a0a0a')
    print(f"Success: Expiry chart saved to {output_image}")

if __name__ == "__main__":
    DB_FILE = 'mock_war_cabinet.db'
    if os.path.exists(DB_FILE): os.remove(DB_FILE)
    seed_mock_db(DB_FILE)
    plot_expiry_intel(DB_FILE)
