namespace Cashless.Api.Services.Infra;

public interface IUidState
{
    void SetLastUid(string uid);
    bool TryTakeLastUid(out string uid);
    bool ConsumePendingIfMatches(string uid);
}
