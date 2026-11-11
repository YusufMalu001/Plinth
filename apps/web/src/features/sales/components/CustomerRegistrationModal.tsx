'use client';

import { Checkbox } from '@plinth/ui';
import React, { useState } from 'react';
import {
  Building2,
  Check,
  Clock,
  CreditCard,
  FileText,
  Hash,
  Mail,
  MapPin,
  Phone,
  User,
} from 'lucide-react';
import {
  Button,
  Dialog,
} from '@plinth/ui';
import { useCurrentUser } from '../../auth/hooks';
import { useCreateSalesCustomer } from '../hooks';
import { Customer, CustomerType } from '../types';
import { FormInput, FormSelect, PhoneInput } from './FormControls';
import {
  STATE_OPTIONS,
  getCitiesForState,
  getCityOptionsForState,
} from '../data/indianStatesAndCities';
import { SearchableSelector } from '@/components/ui/SearchableSelector';
import { formatErrorMessage } from '../utils/error';

interface CustomerRegistrationModalProps {
  isOpen: boolean;
  onClose: () => void;
  onSuccess?: (customer: Customer) => void;
  defaultType?: CustomerType;
}

export function CustomerRegistrationModal({
  isOpen,
  onClose,
  onSuccess,
  defaultType = 'DEALER',
}: CustomerRegistrationModalProps) {
  const { data: currentUser } = useCurrentUser();
  const userRoleKey = (currentUser?.roleDefinition?.key || currentUser?.role || '').toLowerCase();
  const canSetCredit = [
    'admin',
    'super_admin',
    'super-admin',
    'system_admin',
    'accountant',
    'finance_manager',
    'finance-manager',
    'accounts',
    'cfo',
  ].includes(userRoleKey);

  const createCustomer = useCreateSalesCustomer();

  // Basic Details
  const [customerType, setCustomerType] = useState<CustomerType>(defaultType);
  const [name, setName] = useState('');
  const [code, setCode] = useState(() => `CUST-${Math.floor(1000 + Math.random() * 9000)}`);
  const [contactPerson, setContactPerson] = useState('');
  const [contactEmail, setContactEmail] = useState('');
  const [contactPhone, setContactPhone] = useState('');
  const [phoneError, setPhoneError] = useState<string | null>(null);
  const [emailError, setEmailError] = useState<string | null>(null);

  const validatePhone = (value: string): string | null => {
    const trimmed = value.trim();
    if (!trimmed) return null;
    if (trimmed.length < 10) {
      return `Phone number must be exactly 10 digits (${trimmed.length}/10 entered).`;
    }
    if (!/^[6-9]\d{9}$/.test(trimmed)) {
      return 'Please enter a valid 10-digit mobile number (must start with 6, 7, 8, or 9).';
    }
    return null;
  };

  const validateEmail = (value: string): string | null => {
    const trimmed = value.trim();
    if (!trimmed) return null;
    if (!/^[a-zA-Z0-9._%+-]+@[a-zA-Z0-9.-]+\.[a-zA-Z]{2,}$/.test(trimmed)) {
      return 'Please enter a valid email address (e.g. accounts@apex.com).';
    }
    return null;
  };

  // Tax & Financials
  const [taxNumber, setTaxNumber] = useState('');
  const [panNumber, setPanNumber] = useState('');
  const [creditLimit, setCreditLimit] = useState<number>(() => (canSetCredit ? 100000 : 0));
  const [paymentTerms, setPaymentTerms] = useState(() => (canSetCredit ? 'NET_30' : 'IMMEDIATE'));
  const [priceTier] = useState('STANDARD');

  React.useEffect(() => {
    if (!canSetCredit) {
      setCreditLimit(0);
      setPaymentTerms('IMMEDIATE');
    }
  }, [canSetCredit]);

  // Billing Address
  const [billingLine1, setBillingLine1] = useState('');
  const [billingLine2, setBillingLine2] = useState('');
  const [billingCity, setBillingCity] = useState('');
  const [billingState, setBillingState] = useState('');
  const [billingPostalCode, setBillingPostalCode] = useState('');
  const billingCountry = 'IN';

  // Shipping Address
  const [sameAsBilling, setSameAsBilling] = useState(true);
  const [shippingLine1, setShippingLine1] = useState('');
  const [shippingLine2, setShippingLine2] = useState('');
  const [shippingCity, setShippingCity] = useState('');
  const [shippingState, setShippingState] = useState('');
  const [shippingPostalCode, setShippingPostalCode] = useState('');

  const [error, setError] = useState<string | null>(null);

  // Cascading City Options based on selected State
  const billingCityOptions = React.useMemo(() => {
    return getCityOptionsForState(billingState);
  }, [billingState]);

  const shippingCityOptions = React.useMemo(() => {
    return getCityOptionsForState(shippingState);
  }, [shippingState]);

  const handleBillingStateChange = (selectedState: string) => {
    setBillingState(selectedState);
    const validCities = getCitiesForState(selectedState);
    if (billingCity && !validCities.includes(billingCity)) {
      setBillingCity('');
    }
  };

  const handleShippingStateChange = (selectedState: string) => {
    setShippingState(selectedState);
    const validCities = getCitiesForState(selectedState);
    if (shippingCity && !validCities.includes(shippingCity)) {
      setShippingCity('');
    }
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);

    if (!name.trim()) {
      setError('Customer / Dealer name is required.');
      return;
    }
    if (!code.trim()) {
      setError('Customer code is required.');
      return;
    }

    // Validate phone & email
    const pErr = validatePhone(contactPhone);
    const eErr = validateEmail(contactEmail);
    setPhoneError(pErr);
    setEmailError(eErr);

    if (pErr || eErr) {
      setError('Please resolve the highlighted validation errors in contact information.');
      return;
    }

    const formattedPhone = contactPhone.trim() ? (contactPhone.trim().startsWith('+') ? contactPhone.trim() : `+91 ${contactPhone.trim()}`) : undefined;
    const cleanEmail = contactEmail.trim().toLowerCase() || undefined;
    const cleanTaxNumber = taxNumber.trim().replace(/['"`]/g, '').toUpperCase() || undefined;
    const cleanPanNumber = panNumber.trim().replace(/['"`]/g, '').toUpperCase();

    const billingAddress = {
      line1: billingLine1.trim(),
      line2: billingLine2.trim() || undefined,
      city: billingCity.trim(),
      state: billingState.trim(),
      postalCode: billingPostalCode.trim(),
      country: billingCountry,
      customerType,
      contactPerson: contactPerson.trim(),
      panNumber: cleanPanNumber,
      paymentTerms,
      priceTier,
    };

    const shippingAddress = sameAsBilling
      ? { ...billingAddress }
      : {
          line1: shippingLine1.trim(),
          line2: shippingLine2.trim() || undefined,
          city: shippingCity.trim(),
          state: shippingState.trim(),
          postalCode: shippingPostalCode.trim(),
          country: 'IN',
        };

    try {
      const created = await createCustomer.mutateAsync({
        code: code.trim().toUpperCase(),
        name: name.trim(),
        contactEmail: cleanEmail,
        contactPhone: formattedPhone,
        taxNumber: cleanTaxNumber,
        billingAddress,
        shippingAddress,
        creditLimit: Number(creditLimit) || 0,
        paymentTerms,
      });

      const enrichedCustomer: Customer = {
        ...created,
        customerType,
        paymentTerms,
        priceTier,
        panNumber: cleanPanNumber,
        contactPerson: contactPerson.trim(),
        billingAddress,
        shippingAddress,
      };

      if (onSuccess) {
        onSuccess(enrichedCustomer);
      }
      onClose();
    } catch (err: unknown) {
      setError(
        formatErrorMessage(
          err,
          'Failed to register customer/dealer. Please verify account details and try again.'
        )
      );
    }
  };

  return (
    <Dialog
      open={isOpen}
      onClose={onClose}
      title="Register Customer / Dealer"
      description="Add a new commercial account, dealer, distributor, or retail customer to Plinth."
      className="max-w-3xl max-h-[90vh] overflow-y-auto"
    >
      {error && (
        <div className="rounded-xl border border-destructive/30 bg-destructive/10 p-3 text-sm text-destructive font-medium mb-4 flex items-center justify-between gap-2 shadow-none">
          <span>{error}</span>
          <button
            type="button"
            onClick={() => setError(null)}
            className="text-xs font-semibold text-destructive/80 hover:text-destructive underline cursor-pointer shrink-0"
          >
            Dismiss
          </button>
        </div>
      )}

      <form onSubmit={handleSubmit} className="space-y-6 pt-2">
        {/* Section 1: Entity Type & Identification */}
        <div className="space-y-3">
          <h4 className="text-xs font-bold uppercase tracking-wider text-muted-foreground flex items-center gap-1.5">
            <User className="h-3.5 w-3.5 text-primary" /> Entity & Classification
          </h4>
          <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
            <FormSelect
              label="Customer / Dealer Type *"
              icon={Building2}
              value={customerType}
              onChange={(e) => {
                const newType = e.target.value as CustomerType;
                setCustomerType(newType);
                if (newType === 'DEALER') {
                  setCode(`DLR-${Math.floor(1000 + Math.random() * 9000)}`);
                } else if (newType === 'DISTRIBUTOR') {
                  setCode(`DST-${Math.floor(1000 + Math.random() * 9000)}`);
                } else {
                  setCode(`CUST-${Math.floor(1000 + Math.random() * 9000)}`);
                }
              }}
            >
              <option value="DEALER">Dealer / Channel Partner</option>
              <option value="DISTRIBUTOR">Regional Distributor</option>
              <option value="RETAIL">Direct Retail Customer</option>
              <option value="CORPORATE">Corporate / Enterprise</option>
              <option value="INSTITUTIONAL">Institutional / Government</option>
            </FormSelect>

            <FormInput
              label="Customer / Dealer Code *"
              icon={Hash}
              value={code}
              onChange={(e) => setCode(e.target.value.toUpperCase())}
              required
              placeholder="e.g. DLR-1001"
            />

            <FormInput
              label="Business / Legal Name *"
              icon={Building2}
              value={name}
              onChange={(e) => setName(e.target.value)}
              required
              placeholder="e.g. Apex Hardware Pvt Ltd"
            />
          </div>
        </div>

        {/* Section 2: Contact Person & Info */}
        <div className="space-y-3">
          <h4 className="text-xs font-bold uppercase tracking-wider text-muted-foreground flex items-center gap-1.5">
            <Phone className="h-3.5 w-3.5 text-primary" /> Contact Details
          </h4>
          <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
            <FormInput
              label="Contact Person Name"
              icon={User}
              value={contactPerson}
              onChange={(e) => setContactPerson(e.target.value)}
              placeholder="e.g. Rajesh Sharma"
            />

            <PhoneInput
              label="Phone Number"
              value={contactPhone}
              onChange={(val) => {
                setContactPhone(val);
                if (phoneError) setPhoneError(validatePhone(val));
              }}
              onBlur={() => setPhoneError(validatePhone(contactPhone))}
              error={phoneError || undefined}
              placeholder="98765 43210"
            />

            <FormInput
              label="Email Address"
              icon={Mail}
              type="email"
              value={contactEmail}
              onChange={(e) => {
                setContactEmail(e.target.value);
                if (emailError) setEmailError(validateEmail(e.target.value));
              }}
              onBlur={() => setEmailError(validateEmail(contactEmail))}
              error={emailError || undefined}
              placeholder="e.g. accounts@apex.com"
            />
          </div>
        </div>

        {/* Section 3: Tax, Credit & Commercial Terms */}
        <div className="space-y-3">
          <h4 className="text-xs font-bold uppercase tracking-wider text-muted-foreground flex items-center gap-1.5">
            <CreditCard className="h-3.5 w-3.5 text-primary" /> Commercial & Credit Terms
          </h4>
          <div className="grid grid-cols-1 sm:grid-cols-4 gap-4">
            <FormInput
              label="GSTIN / Tax ID"
              icon={FileText}
              value={taxNumber}
              onChange={(e) => setTaxNumber(e.target.value.toUpperCase())}
              placeholder="27AAACG9876B1Z5"
            />

            <FormInput
              label="PAN Number"
              icon={CreditCard}
              value={panNumber}
              onChange={(e) => setPanNumber(e.target.value.toUpperCase())}
              placeholder="AAACG9876B"
            />

            {canSetCredit ? (
              <FormInput
                label="Credit Limit (₹) — Accounts Approved"
                prefixSymbol="₹"
                type="number"
                min="0"
                step="5000"
                value={creditLimit}
                onChange={(e) => setCreditLimit(Number(e.target.value))}
              />
            ) : (
              <div>
                <label className="block text-xs font-semibold text-muted-foreground mb-1.5">
                  Credit Limit (₹)
                </label>
                <div className="flex items-center justify-between p-2.5 rounded-lg border border-border bg-muted/40 text-xs text-muted-foreground">
                  <span className="font-bold text-foreground font-mono">₹0 (Advance / Immediate)</span>
                  <span className="text-[10px] bg-primary/10 text-primary font-semibold px-2 py-0.5 rounded">
                    Governed by Accounts
                  </span>
                </div>
              </div>
            )}

            <FormSelect
              label="Payment Terms"
              icon={Clock}
              value={paymentTerms}
              onChange={(e) => setPaymentTerms(e.target.value)}
            >
              <option value="IMMEDIATE">Immediate / Advance</option>
              <option value="NET_15">Net 15 Days</option>
              <option value="NET_30">Net 30 Days</option>
              <option value="NET_45">Net 45 Days</option>
              <option value="NET_60">Net 60 Days</option>
              <option value="COD">Cash on Delivery (COD)</option>
            </FormSelect>
          </div>
        </div>

        {/* Section 4: Billing Address */}
        <div className="space-y-3">
          <h4 className="text-xs font-bold uppercase tracking-wider text-muted-foreground flex items-center gap-1.5">
            <MapPin className="h-3.5 w-3.5 text-primary" /> Registered Billing Address
          </h4>
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            <div className="sm:col-span-2">
              <FormInput
                label="Address Line 1"
                icon={MapPin}
                value={billingLine1}
                onChange={(e) => setBillingLine1(e.target.value)}
                placeholder="Plot / Shop / Building No., Street"
              />
            </div>
            <div>
              <FormInput
                label="Address Line 2 (Optional)"
                icon={MapPin}
                value={billingLine2}
                onChange={(e) => setBillingLine2(e.target.value)}
                placeholder="Area / Landmark"
              />
            </div>
            <div className="grid grid-cols-1 sm:grid-cols-3 gap-2">
              <SearchableSelector
                label="State"
                value={billingState}
                onChange={handleBillingStateChange}
                options={STATE_OPTIONS}
                placeholder="Search state..."
                allowCustom
              />
              <SearchableSelector
                label="City"
                value={billingCity}
                onChange={setBillingCity}
                options={billingCityOptions}
                placeholder={billingState ? 'Search city...' : 'Select state first'}
                disabled={!billingState}
                allowCustom
              />
              <FormInput
                label="Pincode"
                value={billingPostalCode}
                onChange={(e) => setBillingPostalCode(e.target.value)}
                placeholder="400001"
              />
            </div>
          </div>
        </div>

        {/* Section 5: Shipping Address */}
        <div className="space-y-3">
          <div className="flex items-center justify-between">
            <h4 className="text-xs font-bold uppercase tracking-wider text-muted-foreground flex items-center gap-1.5">
              <MapPin className="h-3.5 w-3.5 text-primary" /> Delivery / Shipping Address
            </h4>
            <label className="flex items-center gap-2 text-xs font-semibold cursor-pointer">
              <Checkbox

                checked={sameAsBilling}
                onChange={(e) => setSameAsBilling(e.target.checked)}
                className="rounded border-border text-primary focus:ring-primary h-4 w-4"
              />
              Same as Billing Address
            </label>
          </div>

          {!sameAsBilling && (
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4 pt-2">
              <div className="sm:col-span-2">
                <FormInput
                  label="Shipping Address Line 1"
                  icon={MapPin}
                  value={shippingLine1}
                  onChange={(e) => setShippingLine1(e.target.value)}
                  placeholder="Warehouse / Site address"
                />
              </div>
              <div>
                <FormInput
                  label="Shipping Address Line 2"
                  icon={MapPin}
                  value={shippingLine2}
                  onChange={(e) => setShippingLine2(e.target.value)}
                  placeholder="Landmark"
                />
              </div>
              <div className="grid grid-cols-1 sm:grid-cols-3 gap-2">
                <SearchableSelector
                  label="State"
                  value={shippingState}
                  onChange={handleShippingStateChange}
                  options={STATE_OPTIONS}
                  placeholder="Search state..."
                  allowCustom
                />
                <SearchableSelector
                  label="City"
                  value={shippingCity}
                  onChange={setShippingCity}
                  options={shippingCityOptions}
                  placeholder={shippingState ? 'Search city...' : 'Select state first'}
                  disabled={!shippingState}
                  allowCustom
                />
                <FormInput
                  label="Pincode"
                  value={shippingPostalCode}
                  onChange={(e) => setShippingPostalCode(e.target.value)}
                  placeholder="Pincode"
                />
              </div>
            </div>
          )}
        </div>

        <div className="flex justify-end gap-2 pt-4 border-t border-border">
          <Button type="button" variant="outline" onClick={onClose} disabled={createCustomer.isPending}>
            Cancel
          </Button>
          <Button type="submit" loading={createCustomer.isPending} icon={Check}>
            Register Customer / Dealer
          </Button>
        </div>
      </form>
    </Dialog>
  );
}
