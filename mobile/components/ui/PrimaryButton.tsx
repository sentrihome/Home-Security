import { forwardRef } from 'react';
import {
  ActivityIndicator,
  Pressable,
  StyleSheet,
  Text,
  type PressableProps,
} from 'react-native';

type PrimaryButtonProps = PressableProps & {
  label: string;
  loading?: boolean;
  variant?: 'primary' | 'secondary' | 'danger';
};

export const PrimaryButton = forwardRef<typeof Pressable, PrimaryButtonProps>(
  function PrimaryButton(
    { label, loading, variant = 'primary', disabled, style, ...rest },
    ref
  ) {
    const isDisabled = disabled || loading;

    return (
      <Pressable
        ref={ref as never}
        accessibilityRole="button"
        disabled={isDisabled}
        style={({ pressed }) => [
          styles.base,
          variant === 'primary' && styles.primary,
          variant === 'secondary' && styles.secondary,
          variant === 'danger' && styles.danger,
          pressed && !isDisabled && styles.pressed,
          isDisabled && styles.disabled,
          typeof style === 'function' ? style({ pressed }) : style,
        ]}
        {...rest}>
        {loading ? (
          <ActivityIndicator color="#fff" />
        ) : (
          <Text
            style={[
              styles.label,
              variant === 'secondary' && styles.secondaryLabel,
            ]}>
            {label}
          </Text>
        )}
      </Pressable>
    );
  }
);

const styles = StyleSheet.create({
  base: {
    minHeight: 48,
    borderRadius: 10,
    alignItems: 'center',
    justifyContent: 'center',
    paddingHorizontal: 16,
  },
  primary: {
    backgroundColor: '#1d4ed8',
  },
  secondary: {
    backgroundColor: 'transparent',
    borderWidth: 1,
    borderColor: '#1d4ed8',
  },
  danger: {
    backgroundColor: '#b91c1c',
  },
  pressed: {
    opacity: 0.85,
  },
  disabled: {
    opacity: 0.45,
  },
  label: {
    color: '#fff',
    fontSize: 16,
    fontWeight: '600',
  },
  secondaryLabel: {
    color: '#1d4ed8',
  },
});
