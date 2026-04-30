import React from 'react';
import { View, Text, StyleSheet } from 'react-native';

interface FuelGaugeProps {
  percentage: number; // 0 to 100 (or > 100)
  color: string;
  radius?: number;
  strokeWidth?: number;
  isSurplus?: boolean;
}

export const FuelGauge = ({ percentage, color, radius = 50, strokeWidth = 8, isSurplus = false }: FuelGaugeProps) => {
  const clampedPercent = Math.min(Math.max(percentage, 0), 100);
  const currentAngle = (clampedPercent / 100) * 180;
  
  return (
    <View style={{ width: radius * 2, height: radius + 10, alignItems: 'center', overflow: 'hidden' }}>
      <View style={{ width: radius * 2, height: radius, overflow: 'hidden', position: 'relative' }}>
        
        {/* Under-Track (Solid Dark) */}
        <ArcSegment radius={radius} strokeWidth={strokeWidth} color="#1e293b" startAngle={0} endAngle={180} />

        {/* Pre-Painted Colored Zones */}
        {percentage >= 100 ? (
          <ArcSegment radius={radius} strokeWidth={strokeWidth} color={color} startAngle={0} endAngle={180} />
        ) : (
          <>
            {/* Deep Red: 0-25% */}
            <ArcSegment radius={radius} strokeWidth={strokeWidth} color="#991b1b" startAngle={0} endAngle={45} />
            {/* Red: 25-50% */}
            <ArcSegment radius={radius} strokeWidth={strokeWidth} color="#ef4444" startAngle={45} endAngle={90} />
            {/* Amber: 50-75% */}
            <ArcSegment radius={radius} strokeWidth={strokeWidth} color="#f97316" startAngle={90} endAngle={135} />
            {/* Yellow: 75-100% */}
            <ArcSegment radius={radius} strokeWidth={strokeWidth} color="#fbbf24" startAngle={135} endAngle={180} />
          </>
        )}
        
        {/* The Mask (Hides the unfilled portion) */}
        <ArcSegment radius={radius} strokeWidth={strokeWidth} color="#1e293b" startAngle={currentAngle} endAngle={180} />
        
        {/* Optional Surplus Indicator Line */}
        {isSurplus && (
          <View style={{
            position: 'absolute', width: strokeWidth + 2, height: strokeWidth + 6, backgroundColor: '#065f46',
            bottom: -3, right: 0, borderRadius: 2
          }} />
        )}

        {/* Center Value */}
        <View style={[styles.centerContent, { bottom: 0 }]}>
          <Text style={[styles.percentText, { color }]}>
            {Math.floor(percentage)}%
          </Text>
          {isSurplus && (
            <Text style={styles.surplusText}>SURPLUS</Text>
          )}
        </View>
      </View>
    </View>
  );
};

const ArcSegment = ({ radius, strokeWidth, color, startAngle, endAngle }: any) => {
  const angle = endAngle - startAngle;
  if (angle <= 0) return null;
  
  return (
    <View style={{
      position: 'absolute', width: radius * 2, height: radius * 2,
      transform: [{ rotate: `${startAngle}deg` }]
    }}>
      <View style={{ width: radius * 2, height: radius, overflow: 'hidden' }}>
        <View style={{
          width: radius * 2, height: radius * 2, borderRadius: radius,
          borderWidth: strokeWidth, borderColor: 'transparent',
          borderTopColor: color, borderLeftColor: color,
          transform: [{ rotate: '45deg' }, { rotate: `${angle - 180}deg` }]
        }} />
      </View>
    </View>
  );
};

const styles = StyleSheet.create({
  centerContent: {
    position: 'absolute',
    width: '100%',
    alignItems: 'center',
    justifyContent: 'flex-end',
  },
  percentText: {
    fontSize: 18,
    fontWeight: 'bold',
    lineHeight: 22,
  },
  surplusText: {
    color: '#065f46',
    fontSize: 9,
    fontWeight: 'bold',
    letterSpacing: 1,
    marginTop: -2,
  }
});
