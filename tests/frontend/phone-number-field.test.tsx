import { fireEvent, render, screen } from "@testing-library/react";
import { PhoneNumberField } from "../../src/components/PhoneNumberField";

it("submits the selected country and preserves user edits during a saved-details refresh", () => {
  const { rerender } = render(<form><PhoneNumberField name="phone" defaultValue="9999991234" /></form>);
  const input = screen.getByLabelText("Mobile number") as HTMLInputElement;
  const form = input.closest("form")!;
  expect(screen.getByLabelText("Country code")).toHaveValue("IN");
  expect(new FormData(form).get("phone")).toBe("+919999991234");
  fireEvent.change(screen.getByLabelText("Country code"), { target: { value: "GB" } });
  fireEvent.change(input, { target: { value: "07700 900123" } });
  expect(new FormData(form).get("phone")).toBe("+447700900123");
  rerender(<form><PhoneNumberField name="phone" defaultValue="+919888881234" /></form>);
  expect(input).toHaveValue("07700 900123");
  expect(screen.getByLabelText("Country code")).toHaveValue("GB");
});

it("accepts international paste and blocks malformed input with visible guidance", () => {
  render(<form><PhoneNumberField name="phone" /></form>);
  const input = screen.getByLabelText("Mobile number") as HTMLInputElement;
  fireEvent.change(input, { target: { value: "+39 02 3661 8300" } });
  expect(screen.getByLabelText("Country code")).toHaveValue("IT");
  expect(input).toHaveValue("0236618300");
  expect(new FormData(input.closest("form")!).get("phone")).toBe("+390236618300");
  fireEvent.change(input, { target: { value: "123abc" } });
  fireEvent.blur(input);
  expect(input).toBeInvalid();
  expect(screen.getByRole("alert")).toHaveTextContent("Check the number for the selected country.");
  expect(new FormData(input.closest("form")!).get("phone")).toBe("");
});

it("updates untouched fields when saved details arrive asynchronously", () => {
  const { rerender } = render(<PhoneNumberField />);
  rerender(<PhoneNumberField defaultValue="+447700900123" />);
  expect(screen.getByLabelText("Country code")).toHaveValue("GB");
  expect(screen.getByLabelText("Mobile number")).toHaveValue("7700900123");
});
