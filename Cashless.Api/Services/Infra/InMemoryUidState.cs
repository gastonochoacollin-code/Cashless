namespace Cashless.Api.Services.Infra;

public sealed class InMemoryUidState : IUidState
{
    private readonly object _lock = new();
    private string? _lastUid;
    private string? _pendingChargeUid;

    public void SetLastUid(string uid)
    {
        lock (_lock)
        {
            _lastUid = uid;
        }
    }

    public bool TryTakeLastUid(out string uid)
    {
        lock (_lock)
        {
            if (string.IsNullOrWhiteSpace(_lastUid))
            {
                uid = string.Empty;
                return false;
            }

            _pendingChargeUid = _lastUid;
            uid = _lastUid;
            _lastUid = null;
            return true;
        }
    }

    public bool ConsumePendingIfMatches(string uid)
    {
        lock (_lock)
        {
            if (_pendingChargeUid == null || !string.Equals(_pendingChargeUid, uid, StringComparison.Ordinal))
                return false;

            _pendingChargeUid = null;
            return true;
        }
    }
}
