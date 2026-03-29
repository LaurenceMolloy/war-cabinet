# War Cabinet: Cellar Inventory App
A professional-grade Android mobile application (Native) designed to manage a long-term stockpile of non-perishable goods for eventualities such as supply chain disruption or hyper-inflation.

## 🛠 Tech Stack (Recommended)
- **Framework**: React Native with Expo (Provides native performance with easy laptop-based browser testing).
- **Database**: SQLite (Local-first persistence).
- **UI**: Modern Dark Mode with a "Solid/Rugged" aesthetic.

## 📂 Data Model

### 1. Catalog (Enumerated Types)
The app must be seeded with these categories and items. Users can manage this catalog (Add/Edit/Delete Types) in the App Settings.
- **[Alcohol]**: Red Wine, White Wine, Rose Wine
- **[Sweeteners]**: Honey
- **[Carbohydrates]**: Basmati Rice, Tagliatelle, Penne Pasta, Noodles
- **[Seasonings]**: Salt, Black Pepper, Mixed Herbs, Oregano, Paprika, Coriander, Cumin
- **[Canned Goods]**: Tomatoes, Passata, Tomato Puree, Sweetcorn, Kidney Beans, Tuna
- **[Chinese]**: Soy Sauce, Sesame Oil, Rice Wine
- **[Indian]**: Madras Curry Sauce
- **[Coffee/Tea]**: Instant Coffee, Tea bags

### 2. Stock Inventory
Items are unique per (Name + Size + Expiry Date).
- **Fields**: Quantity (Integer), Size (Value + Unit), Expiry Date (Month/Year or Unknown), Entry Date (Month/Year, auto-populated, overrideable).

## ⚡ Functional Requirements

### 📥 Data Entry & Size Picking
- **Quantity**: +/- Stepper or numeric input.
- **Smart Size Selection**:
    - **Liquids**: 50ml increments (50-300), 400ml, 500ml, 750ml, 1L.
    - **Solids**: 50g increments (50-300), 400g, 500g, 750g, 1kg.
    - **Manual Override**: Allow any string (e.g., "3 Ltr", "5 Ltr"). New manual sizes should be saved as "Quick Chips" for that item type.

### 🔔 Expiry Alerts (Color Coding)
| Status | Condition (Known Expiry) | Condition (Unknown Expiry) |
| :--- | :--- | :--- |
| 🔴 **Red** | Expired | > 18 months since Entry |
| 🟠 **Amber** | < 3 months remaining | > 12 months since Entry |
| 🟡 **Yellow** | < 6 months remaining | > 6 months since Entry |

### 🔍 View & Search
- **Hierarchy**: Category > Item Type > [List of Batches by Expiry].
- **Collapsible**: Categories and Item Groups must be toggleable.
- **Search**: Case-insensitive search bar filtering by name or category.

## 🎨 User Experience
- **Dark Mode**: High-contrast theme for low-light cellar use.
- **Icons**: Use category-specific icons (e.g., 🍷 for Alcohol, 🥫 for Canned Goods) to improve "smile factor."
- **Persistence**: Remembers which categories were collapsed between sessions.

## 📦 Delivery
- **installation.md**: Must document Windows setup, laptop-browser testing via Expo/Web, and APK deployment.
- **Data Safety**: Feature to export/import the SQLite database as a file for backup.
