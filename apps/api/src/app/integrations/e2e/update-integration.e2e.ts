import { IntegrationRepository } from '@novu/dal';
import { UserSession } from '@novu/testing';
import { expect } from 'chai';
import { ChannelTypeEnum } from '@novu/shared';

describe('Update Integration - /integrations/:integrationId (PUT)', function () {
  let session: UserSession;
  const integrationRepository = new IntegrationRepository();

  beforeEach(async () => {
    session = new UserSession();
    await session.initialize();
  });

  it('should update newly created integration', async function () {
    const payload = {
      providerId: 'sendgrid',
      channel: ChannelTypeEnum.EMAIL,
      credentials: { apiKey: 'new_key', secretKey: 'new_secret' },
      active: true,
      check: false,
    };

    payload.credentials = { apiKey: 'new_key', secretKey: 'new_secret' };

    const integrationId = (await session.testAgent.get(`/v1/integrations`)).body.data.find(
      (integration) => integration.channel === 'email'
    )._id;

    // update integration
    await session.testAgent.put(`/v1/integrations/${integrationId}`).send(payload);

    const integration = (await session.testAgent.get(`/v1/integrations`)).body.data[0];

    expect(integration.credentials.apiKey).to.equal(payload.credentials.apiKey);
    expect(integration.credentials.secretKey).to.equal(payload.credentials.secretKey);
  });

  it('should deactivate other providers on the same channel', async function () {
    const firstProviderPayload = {
      providerId: 'sendgrid',
      channel: ChannelTypeEnum.EMAIL,
      credentials: { apiKey: '123', secretKey: 'abc' },
      active: true,
      check: false,
    };
    const secondProviderPayload = {
      providerId: 'mailgun',
      channel: ChannelTypeEnum.EMAIL,
      credentials: { apiKey: '123', secretKey: 'abc' },
      active: false,
      check: false,
    };

    // create integrations
    await session.testAgent.post('/v1/integrations').send(firstProviderPayload);
    const mailgunIntegrationId = (await session.testAgent.post('/v1/integrations').send(secondProviderPayload)).body
      .data._id;

    // create irrelevant channel -> should not be affected by the update
    firstProviderPayload.channel = ChannelTypeEnum.SMS;
    await session.testAgent.post('/v1/integrations').send(firstProviderPayload);

    // update second integration
    secondProviderPayload.active = true;
    await session.testAgent.put(`/v1/integrations/${mailgunIntegrationId}`).send(secondProviderPayload);

    const integrations = await integrationRepository.findByEnvironmentId(session.environment._id);

    const firstProviderIntegration = integrations.find(
      (i) => i.providerId.toString() === 'sendgrid' && i.channel.toString() === ChannelTypeEnum.EMAIL
    );
    const secondProviderIntegration = integrations.find((i) => i.providerId.toString() === 'mailgun');
    const irrelevantProviderIntegration = integrations.find(
      (i) => i.providerId.toString() === 'sendgrid' && i.channel.toString() === ChannelTypeEnum.SMS
    );

    expect(firstProviderIntegration.active).to.equal(false);
    expect(secondProviderIntegration.active).to.equal(true);
    expect(irrelevantProviderIntegration.active).to.equal(true);
  });

  it('should update custom SMTP integration with TLS options successfully', async function () {
    const nodeMailerProviderPayload = {
      providerId: 'nodemailer',
      channel: 'email',
      credentials: {
        host: 'smtp.example.com',
        port: '587',
        secure: true,
        requireTls: true,
        tlsOptions: { rejectUnauthorized: false },
      },
      active: true,
      check: false,
    };

    // create integration
    const nodeMailerIntegrationId = (await session.testAgent.post('/v1/integrations').send(nodeMailerProviderPayload))
      .body.data._id;

    // update integration
    const updatedNodeMailerProviderPayload = {
      providerId: 'nodemailer',
      channel: 'email',
      credentials: {
        host: 'smtp.example.com',
        port: '587',
        secure: true,
        requireTls: false,
        tlsOptions: { rejectUnauthorized: false, enableTrace: true },
      },
      active: true,
      check: false,
    };
    await session.testAgent.put(`/v1/integrations/${nodeMailerIntegrationId}`).send(updatedNodeMailerProviderPayload);

    const integrations = await integrationRepository.findByEnvironmentId(session.environment._id);

    const nodeMailerIntegration = integrations.find((i) => i.providerId.toString() === 'nodemailer');

    expect(nodeMailerIntegration?.credentials?.host).to.equal(updatedNodeMailerProviderPayload.credentials.host);
    expect(nodeMailerIntegration?.credentials?.port).to.equal(updatedNodeMailerProviderPayload.credentials.port);
    expect(nodeMailerIntegration?.credentials?.secure).to.equal(updatedNodeMailerProviderPayload.credentials.secure);
    expect(nodeMailerIntegration?.credentials?.requireTls).to.equal(
      updatedNodeMailerProviderPayload.credentials.requireTls
    );
    expect(nodeMailerIntegration?.credentials?.tlsOptions).to.instanceOf(Object);
    expect(nodeMailerIntegration?.credentials?.tlsOptions).to.eql(
      updatedNodeMailerProviderPayload.credentials.tlsOptions
    );
    expect(nodeMailerIntegration?.active).to.equal(true);
  });
});
