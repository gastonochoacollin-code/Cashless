namespace Cashless.Api.Services.Infra;

public sealed class InMemoryUidState : IUidState
{
    private readonly object _lock = new();
    private string? _lastUid;
    private string? _pendingChargeUid;
    private readonly Dictionary<string, string> _lastByTerminal = new(StringComparer.OrdinalIgnoreCase);
    private readonly Dictionary<string, string> _pendingByTerminal = new(StringComparer.OrdinalIgnoreCase);

    public void SetLastUid(string uid, string? terminalId = null)
    {
        lock (_lock)
        {
            _lastUid = uid;
            _pendingChargeUid = uid;

            var key = NormalizeTerminal(terminalId);
            if (key != null)
            {
                _lastByTerminal[key] = uid;
                _pendingByTerminal[key] = uid;
            }
        }
    }

    public bool TryPeekLastUid(out string uid)
    {
        lock (_lock)
        {
            if (string.IsNullOrWhiteSpace(_lastUid))
            {
                uid = string.Empty;
                return false;
            }

            uid = _lastUid;
            return true;
        }
    }

    public bool TryTakeLastUid(out string uid, string? terminalId = null)
    {
        lock (_lock)
        {
            var key = NormalizeTerminal(terminalId);
            if (key != null && _lastByTerminal.TryGetValue(key, out var termUid))
            {
                uid = termUid;
                _lastByTerminal.Remove(key);
                return true;
            }

            if (string.IsNullOrWhiteSpace(_lastUid))
            {
                uid = string.Empty;
                return false;
            }

            uid = _lastUid;
            _lastUid = null;
            return true;
        }
    }

    public bool ConsumePendingIfMatches(string uid, string? terminalId = null)
    {
        lock (_lock)
        {
            var key = NormalizeTerminal(terminalId);
            if (key != null && _pendingByTerminal.TryGetValue(key, out var pending))
            {
                if (!string.Equals(pending, uid, StringComparison.Ordinal))
                    return false;

                if (_lastByTerminal.TryGetValue(key, out var last) && string.Equals(last, uid, StringComparison.Ordinal))
                    _lastByTerminal.Remove(key);

                _pendingByTerminal.Remove(key);
                return true;
            }

            if (_pendingChargeUid == null || !string.Equals(_pendingChargeUid, uid, StringComparison.Ordinal))
                return false;

            if (string.Equals(_lastUid, uid, StringComparison.Ordinal))
                _lastUid = null;

            _pendingChargeUid = null;
            return true;
        }
    }

    private static string? NormalizeTerminal(string? terminalId)
    {
        var t = (terminalId ?? string.Empty).Trim();
        return string.IsNullOrWhiteSpace(t) ? null : t.ToUpperInvariant();
    }
}
