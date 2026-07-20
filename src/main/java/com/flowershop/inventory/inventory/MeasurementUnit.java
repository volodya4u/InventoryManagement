package com.flowershop.inventory.inventory;

import java.util.Locale;

public enum MeasurementUnit {
    PIECE,
    BUNCH,
    GRAM,
    KILOGRAM,
    METER,
    PACKAGE;

    public static MeasurementUnit from(String value) {
        try {
            return MeasurementUnit.valueOf(value.toUpperCase(Locale.ROOT));
        } catch (IllegalArgumentException | NullPointerException exception) {
            throw new IllegalArgumentException("Unsupported measurement unit");
        }
    }
}
