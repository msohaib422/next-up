import Input from './Input'

export default function DatePicker({ label, value, onChange, error, ...props }) {
  return (
    <Input
      label={label}
      type="datetime-local"
      value={value}
      onChange={onChange}
      error={error}
      {...props}
    />
  )
}
