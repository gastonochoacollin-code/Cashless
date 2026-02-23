namespace Cashless.Api.Services.Infra;

public sealed class InMemoryUidState : IUidState
{
    private readonly object _lock = new();
    private const string DefaultTerminal = "DEFAULT";
    private string? _pendingChargeUid;
    private readonly Dictionary<string, string> _lastByTerminal = new(StringComparer.OrdinalIgnoreCase);
    private readonly Dictionary<string, string> _pendingByTerminal = new(StringComparer.OrdinalIgnoreCase);

    public void SetLastUid(string uid, string? terminalId = null)
    {
        lock (_lock)
        {
            var key = NormalizeTerminal(terminalId);
            _lastByTerminal[key] = uid;
            _pendingByTerminal[key] = uid;

            // Compat: allow pending charge validation when terminalId isn't provided.
            _pendingChargeUid = uid;
        }
    }

    public bool TryPeekLastUid(out string uid)
    {
        lock (_lock)
        {
            if (_lastByTerminal.TryGetValue(DefaultTerminal, out var last))
            {
                uid = last;
                return true;
            }

            uid = string.Empty;
            return false;
        }
    }

    public bool TryTakeLastUid(out string uid, string? terminalId = null)
    {
        lock (_lock)
        {
            var key = NormalizeTerminal(terminalId);
            if (_lastByTerminal.TryGetValue(key, out var termUid))
            {
                uid = termUid;
                _lastByTerminal.Remove(key);
                return true;
            }

            uid = string.Empty;
            return false;
        }
    }

    public bool ConsumePendingIfMatches(string uid, string? terminalId = null)
    {
        lock (_lock)
        {
            var key = NormalizeTerminal(terminalId);
            if (_pendingByTerminal.TryGetValue(key, out var pending))
            {
                if (!string.Equals(pending, uid, StringComparison.Ordinal))
                    return false;

                if (_lastByTerminal.TryGetValue(key, out var last) && string.Equals(last, uid, StringComparison.Ordinal))
                    _lastByTerminal.Remove(key);

                _pendingByTerminal.Remove(key);
                return true;
            }

            if (string.IsNullOrWhiteSpace(terminalId))
            {
                if (_pendingChargeUid == null || !string.Equals(_pendingChargeUid, uid, StringComparison.Ordinal))
                    return false;

                if (_lastByTerminal.TryGetValue(DefaultTerminal, out var lastDefault)
                    && string.Equals(lastDefault, uid, StringComparison.Ordinal))
                    _lastByTerminal.Remove(DefaultTerminal);

                _pendingChargeUid = null;
                return true;
            }

            return false;
        }
    }

    private static string NormalizeTerminal(string? terminalId)
    {
        var t = (terminalId ?? string.Empty).Trim();
        return string.IsNullOrWhiteSpace(t) ? DefaultTerminal : t.ToUpperInvariant();
    }
}
