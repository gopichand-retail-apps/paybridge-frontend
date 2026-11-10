import { ArrowUpRight, LockKeyhole, ShieldCheck, WalletCards } from 'lucide-react'
import { useState, type FormEvent, type ReactNode } from 'react'
import type { WorkspaceProfile } from '../api'
import { useContent } from '../content-context'
import { dataString, dataStringAt } from '../content-schema'

interface WorkspaceSignInProps {
  accounts: WorkspaceProfile[]
  error: string
  busy: boolean
  isMock: boolean
  offlineNotice?: ReactNode
  onLogin: (accountId: string) => Promise<void>
}

export function WorkspaceSignIn({ accounts, error, busy, isMock, offlineNotice, onLogin }: WorkspaceSignInProps) {
  const { model, t } = useContent()
  const [accountId, setAccountId] = useState(dataString(model, 'defaultProfile'))
  const selectedAccountId = accounts.some((account) => account.id === accountId)
    ? accountId
    : accounts[0]?.id ?? ''

  function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault()
    if (selectedAccountId) void onLogin(selectedAccountId)
  }

  return (
    <main className="login-screen" data-mode={isMock ? 'mock' : 'server'}>
      <div className="login-aside">
        <div className="login-brand">
          <span className="brand-mark"><WalletCards aria-hidden="true" size={21} /></span>
          <span>{t('brand.name')}</span>
        </div>
        <div className="login-aside-copy">
          <span className="eyebrow eyebrow-light">{t('signIn.eyebrow')}</span>
          <h1>{t('signIn.heroTitle')}</h1>
          <p>{t('signIn.heroDescription')}</p>
          <div className="flow-steps" aria-label={t('signIn.lifecycle')}>
            <span>{t('signIn.intent')}</span><i /><span>{t('signIn.authorize')}</span><i />
            <span>{t('signIn.capture')}</span><i /><span>{t('signIn.reconcile')}</span>
          </div>
        </div>
        <div className="login-aside-footer">
          <ShieldCheck aria-hidden="true" size={17} />
          <span>{t('signIn.safety')}</span>
        </div>
      </div>

      <section className="login-main" aria-labelledby="login-title">
        {offlineNotice}
        <div className="login-card">
          <span className="eyebrow">{t('signIn.access')}</span>
          <h2 id="login-title">{t('signIn.title')}</h2>
          <p className="login-description">{t('signIn.description')}</p>

          <form onSubmit={submit}>
            <label className="field-label" htmlFor="workspace-profile">{t('signIn.profile')}</label>
            <div className="select-with-icon">
              <LockKeyhole aria-hidden="true" size={17} />
              <select
                id="workspace-profile"
                onChange={(event) => setAccountId(event.target.value)}
                required
                value={selectedAccountId}
              >
                {accounts.map((account) => (
                  <option key={account.id} value={account.id}>
                    {t(`role.${account.role}`)} · {dataStringAt(model, 'profiles', account.id, 'name')}
                  </option>
                ))}
              </select>
            </div>
            <p className="field-hint">
              {t('signIn.profileHint')}
            </p>
            {error && <p className="form-error" role="alert">{error}</p>}
            <button className="primary-button login-submit" disabled={busy || accounts.length === 0} type="submit">
              <span>{busy ? t('signIn.opening') : t('signIn.continue')}</span>
              <ArrowUpRight aria-hidden="true" size={18} />
            </button>
          </form>

          <div className="login-notice">
            <ShieldCheck aria-hidden="true" size={16} />
            <span>{t('signIn.notice')}</span>
          </div>
        </div>
        <p className="login-legal-note">{t('signIn.legal')}</p>
      </section>
    </main>
  )
}